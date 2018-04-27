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
var mongoose = require('mongoose');
var config = require('config');
const {google} = require('googleapis');
var email = null;
// var gapi = require('gapi');
var search = require('youtube-search');
var path = require('path');
var engine = require('consolidate');
var async = require('asyncawait/async');
var await = require('asyncawait/await');



var client_id = config.get('client_id'); // Your client id
var client_secret = config.get('client_secret'); // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

let accessGlobal = "Hello";

var SpotifyWebApi = require('spotify-web-api-node');
var me = {};

// credentials are optional
var spotifyApi = new SpotifyWebApi({
  clientId : client_id ,
  clientSecret : client_secret,
  redirectUri : redirect_uri
});


var dbConfig = config.get('dbConfig');
mongoose.connect(dbConfig);

var mongo = require('mongodb');


var Schema = mongoose.Schema;
var users = mongoose.model('spotify', new Schema({email: String},{collection: 'spotify'}));
users.find({}, function(err, docs){
  if(err)
    console.log('error occured in the database');
  //get just the emails
  docs.forEach( function(element){
     //console.log(element.email);
  });
});

const assert = require('assert');

var MongoClient = require('mongodb').MongoClient;
var url = config.get('mongo_add');

var insert = function(url){
  MongoClient.connect(url, function(err, db) {
  if (err) throw err;
  var dbo = db.db("411");
  var myobj = { name: "Company Inc", address: "Highway 37" };
  dbo.collection("Users").insertOne(myobj, function(err, res) {
    if (err) throw err;
    console.log("1 document inserted");
    db.close();
  });
});
}

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

var runSpotify = function() {
  var search = document.getElementById("search");
  var options = {
    url: 'https://api.spotify.com/v1/search?type=track&q=' + search,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  console.log(access_token);
  console.log(options);
  request.get(options, function(error, response, body) {
    document.getElementById("result").appendChild(body);
  });
};


var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());
//some html rendering thing
// app.engine('html', engine.mustache);
// app.set('view engine', 'html');

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

// app.get('/lol', function() {
//   let client;
//
//   try {
//     client = await MongoClient.connect(url);
//     console.log("Connected correctly to server");
//
//     const db = client.db("411");
//
//     // Insert a single document
//     let r = await db.collection('Users').insertOne({a:1});
//     assert.equal(1, r.insertedCount);
//
//     // Insert multiple documents
//     r = await db.collection('Users').insertMany([{a:2}, {a:3}]);
//     assert.equal(2, r.insertedCount);
//   } catch (err) {
//     console.log(err.stack);
//   }
//
//   // Close connection
//   client.close();
// });

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

          //check the top artists around.
          var favoriteArtists = [];
          body["items"].forEach(function(arr) {
            favoriteArtists.push(arr["name"]);
          });

          MongoClient.connect(url, function(err, db) {
          if (err) throw err;
          var dbo = db.db("411");
          console.log(me);
          email = me.email;
          var myobj = { name: me.display_name, email:me.email, address: favoriteArtists, accessToken: access_token, accessed: Date.now()};
          console.log("email" + me.email);
          dbo.collection("Users").findOne({email: me.email}, function(err, result){
            if (err) throw err;
            // console.log(result);
            if (result == null){
              console.log("adding");
              console.log("email " + me.email);
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
/*          else{
          dbo.collection("Users").insertOne(myobj, function(err, res) {
            if (err) throw err;
            console.log("1 document inserted");

            db.close();
          });
        });*/
      });

          // console.log(favoriteArtists);
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

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
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

//has user_id and playlist_id as params
//it gets the playlists artists and the number of times they appear
app.get('/playlist', function(req, res) {

    var options = {
      url: 'https://api.spotify.com/v1/users/' + req.query.user_id + '/playlists/' + req.query.playlist_id + '/tracks',
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
        var artists = {};
        body["items"].forEach(function(arr){
          var name = arr["track"]["artists"][0]["name"];
          artists[name] = (artists[name] || 0) + 1;
        });
        console.log(artists);
      }else{
        res.send({
          'body': 'something went wrong'
        });
      }
    });

});

//youtube api call to get search of videos
app.get('/youtube', function(req, res){
  var list = [];
  var vids = [];
  var error = 'yes';
  var x = function (){
    MongoClient.connect(url, function(err, db) {
      if (err) throw err;
      var dbo = db.db("411");
      dbo.collection("Users").findOne({email: email}, function(err, result){
        if (err) throw err;
        if (result == null){
          console.log("coudn't find the logged in user's data");
        }else{
          console.log(result);
          //THE ARRAY OF ARTISTS HERE
          list = result.address;
          console.log("the list: ", list);
          var opts = {
            maxResults: 1,
            key: 'AIzaSyAOWLoz4oC_e4WPI8-fELrrnllEDXmeKRQ'
          };
          list.forEach(function(element){
            search(element+ ' live concert', opts, function(err, results) {
              if(err) return console.log(err);
              vids.push(results[0].id);
              console.log(results[0].id);
            });
          });
          if(vids.length != 0){
            error = 'no';
          }
        }
        db.close();
      });
    });
    return null;
  };
  x();
  var please = function(){
    console.log('sending the request');
    res.send({
      'ids': vids,
      'error': error
    });
  };
  setTimeout(function(){ please()}, 500);
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
   res.sendfile('./public/youtube.html', {hello:"HELLO"});
});


console.log('Listening on 8888');
app.listen(8888);
