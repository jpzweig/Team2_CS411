/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var config = require('config');
var email = null;
var search = require('youtube-search');
var path = require('path');
var mongo = require('mongodb');

var client_id = config.get('client_id'); // Your client id
var client_secret = config.get('client_secret'); // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

let accessGlobal = "";
var favoriteArtists = [];
var artistPictures = [];

var SpotifyWebApi = require('spotify-web-api-node');
var me = {};
var stateKey = 'spotify_auth_state';

// credentials are optional
var spotifyApi = new SpotifyWebApi({
  clientId : client_id ,
  clientSecret : client_secret,
  redirectUri : redirect_uri
});

var MongoClient = require('mongodb').MongoClient;
var url = config.get('mongo_add');

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

//some html rendering thing
app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-private user-library-read user-top-read user-read-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        accessGlobal = body.access_token;

        var time_range = ['short_term','medium_term','long_term'];

        var options = {
          url: 'https://api.spotify.com/v1/me/top/artists?time_range='+time_range[0],
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };
        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {

          spotifyApi.setAccessToken(access_token);

          spotifyApi.getMe().then(function(data) {
             me = data.body;
            }, function(err) {
              console.log('Something went wrong!', err);
            });
            favoriteArtists = [];
            artistPictures = [];
          body["items"].forEach(function(arr) {
            artistPictures.push(arr['images'][2]['url']);
            favoriteArtists.push(arr["name"]);
          });

          MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var dbo = db.db("411");
            email = me.email;
            var myobj = { name: me.display_name, email:me.email, address: favoriteArtists, accessToken: access_token, accessed: Date.now()};
            var insertUpdate = function(){
              dbo.collection("Users").findOne({email: me.email}, function(err, result){
                if (err) throw err;
                if (result == null){
                  dbo.collection("Users").insertOne(myobj, function(err, res) {
                    if (err) throw err;
                    console.log("1 document inserted");
                    db.close();
                  });
                }else{
                  console.log("updating")
                  dbo.collection("Users").update(
                      { email:me.email },
                      { $set:
                        {
                          name: me.display_name,
                          address: favoriteArtists,
                          accessToken: access_token,
                          accessed: Date.now()
                        }
                      }
                    );
                    db.close();
                }
              });
            }
          setTimeout(function(){insertUpdate()}, 500);
        });
      });

      // we can also pass the token to the browser to make requests from there
      res.redirect('/#' +
        querystring.stringify({
          access_token: access_token,
          refresh_token: refresh_token
        }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

//has q as param req aka req.query.q
app.get('/search', function(req, res) {
    //setting up the search parameters
    var options = {
      url: 'https://api.spotify.com/v1/search?type=track&q=' + req.query.q +'&limit=5',
      headers: { 'Authorization': 'Bearer ' + accessGlobal },
      json: true
    };
    //here is where the search request is made
    request.get(options, function(error, response, body) {
      //console.log(response);
      if (!error && response.statusCode === 200) {
        res.send({
          'body': body
        });
      }else{
        res.send({
          'body': 'something went wrong'
        });
      }
    });
});

var sortArray = function (keyval) {
  // convert object into array
	var sortable = [];
  var array = [];
	for(var key in keyval)
		if(keyval.hasOwnProperty(key))
			sortable.push([key, keyval[key]]); // each item is an array in format [key, value]

	// sort items by value
	sortable.sort(function(a, b)
	{
	  return a[1]-b[1]; // compare numbers
	});

  console.log("sortable before reverse", sortable);

  sortable.reverse();

  console.log("sortable after reverse", sortable);

  console.log("sample object key", sortable[0][0]);

  for (var i=0; i < 20; i++) {
    array.push(sortable[i][0]);
  }

  console.log("length of array from sortable", array.length);
  console.log("array from sortable", array);

	return array;
}

//has user_id and playlist_id as params
//it gets the playlists artists and the number of times they appear
app.get('/playlist', function(req, res) {
    var artistlist = [];
    var vids = [];
    var options = {
      url: 'https://api.spotify.com/v1/users/' + req.query.user_id + '/playlists/' + req.query.playlist_id + '/tracks',
      headers: { 'Authorization': 'Bearer ' + accessGlobal },
      json: true
    };

    //here is where the search request is made
    request.get(options, function(error, response, body) {
      //console.log(response);
      if (!error && response.statusCode === 200) {
        var artists = {};
        body["items"].forEach(function(arr){
          var name = arr["track"]["artists"][0]["name"];
          artists[name] = (artists[name] || 0) + 1;
        });
        console.log(artists);
        artistlist = sortArray (artists);
        vids = YTcall(artistlist);
        var send = function(){
          console.log('sending the request');
          console.log("the vidarray: ", vids);
          res.send({
            'ids': vids
          });
        };
        setTimeout(function(){send()}, 1000);
      }else{
        res.send({
          'body': 'something went wrong'
        });
      }
    });

});

app.get('/artists', function(req,res){
  var items = [];
  for (var i = 0; i < favoriteArtists.length; i++){
    var data = { 'name': favoriteArtists[i], 'img': artistPictures[i]};
    items.push(data);
  }
  console.log(items);
  res.send({
    'items': items
  });
  //create a json from these inputs with items
});

var YTcall = function(artist) {
  var vids = [];
  //THE ARRAY OF ARTISTS HERE
  console.log("the list: ", artist);
  var opts = {
    maxResults: 1,
    key: 'AIzaSyAOWLoz4oC_e4WPI8-fELrrnllEDXmeKRQ'
  };
  artist.forEach(function(element){
    search(element+ ' live concert', opts, function(err, results) {
      if(err) return console.log(err);
      console.log(results);
      var data = {
        'id': results[0].id,
        'title': results[0].title
      }
      vids.push(data);
    });
  });
  return vids;
};

//youtube api call to get search of videos
app.get('/youtube', function(req, res){
  var list = [];
  var vids = [];
  var favartist = function (){
    MongoClient.connect(url, function(err, db) {
      if (err) throw err;
      var dbo = db.db("411");
      dbo.collection("Users").findOne({email: email}, function(err, result){
        if (err) throw err;
        if (result == null){
          console.log("coudn't find the logged in user's data");
        }else{
          vids = YTcall(list);
        }
        db.close();
      });
    });
  };

  var send = function(){
    console.log('sending the request');
    console.log("the vidarray: ", vids);
    res.send({
      'ids': vids
    });
  };
  setTimeout(function(){send()}, 1000);
});


app.get('/playlistthing', function(req, res){
  // var sampleClient = new SampleClient();
  // // initialize the Youtube API library
  // const youtube = google.youtube({
  //   version: 'v3',
  //   auth: sampleClient.oAuth2Client
  // });
  //
  // // a very simple example of getting data from a playlist
  // function runSample () {
  //   // the first query will return data with an etag
  //   const res = getPlaylistData(null);
  //   const etag = res.data.etag;
  //   console.log(`etag: ${etag}`);
  //
  //   // the second query will (likely) return no data, and an HTTP 304
  //   // since the If-None-Match header was set with a matching eTag
  //   const res2 = getPlaylistData(etag);
  //   console.log(res2.status);
  // }
  //
  // function getPlaylistData (etag) {
  //   // Create custom HTTP headers for the request to enable use of eTags
  //   const headers = {};
  //   if (etag) {
  //     headers['If-None-Match'] = etag;
  //   }
  //   const res = youtube.playlists.list({
  //     part: 'id,snippet',
  //     id: 'PLIivdWyY5sqIij_cgINUHZDMnGjVx3rxi',
  //     headers: headers
  //   });
  //   console.log('Status code: ' + res.status);
  //   console.log(res.data);
  //   return res;
  // }
  // const scopes = [
  //   'https://www.googleapis.com/auth/youtube'
  // ];
  //
  // sampleClient.authenticate(scopes)
  //   .then(c => runSample())
  //   .catch(console.error);
});

app.get("/yt", (req, res) => {
  // console.log("HERESS:");
  res.sendfile('public/youtube.html', {hello:"HELLO"});
});

app.get('/', function (req, res) {
  res.render('home', {title: "asdfasdfasdf"});
});

console.log('Listening on 8888');
app.listen(8888);
