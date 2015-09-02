var async = require('async');
var rest = require('restler');
var express = require('express');

var app = express();

app.post('/session/:db', function(req, res) {
  // Validate Authorization header exists
  var authorization = req.get('Authorization');
  if (!authorization) {
    res.status(400).send('Authorization header is required');
  }

  // Validate SecureToken header exists
  var secureToken = req.get('SecureToken');
  if (!secureToken) {
    res.status(400).send('SecureToken header is required');
  }

  var headers = {
    'Authorization': authorization,
    'SecureToken': secureToken,
    'Accept': 'application/json'
  };

  var couchUrl = 'http://127.0.0.1:4985/' + req.params.db + '/';

  async.waterfall([
    // Ensure the database exists
    function(callback) {
      rest.get(couchUrl).on('complete', function(data, response) {
        if (!response) {
          callback(true, 'No response checking for database existence');
          return;
        }
        if (response.statusCode != 200) {
          callback(true, 'The database ' + req.params.db + ' does not exist');
        } else {
          callback(null);
        }
      });
    },
    // Query the customer ID from USANA by requesting their volume report
    function(callback) {
      rest.get('https://www.usanabeta.com/usana-api/rest/volumeReport/current', {
        headers: headers
      }).on('complete', function(data, response) {
        if (!response) {
          callback(true, 'No response');
          return;
        }
        if (response.statusCode == 200) {
          if (data.customerId) {
            callback(null, data.customerId);
          } else {
            callback(true, 'Data: ' + data);
          }
        } else {
          callback(true, 'Response: ' + response);
        }
      });
    },
    // Check to see if the user exists in the sync gateway, and create them if they don't exist
    function(customerId, callback) {
      rest.get(couchUrl + '_user/' + customerId).on('complete', function(data, response) {
        if (!response) {
          callback(true, 'Got no response checking for existence of user ' + customerId);
          return;
        }
        if (response.statusCode == 404) {
          console.log(customerId + ' does not exist, trying to create');
          rest.put(couchUrl + '_user/' + customerId, {
            data: JSON.stringify({name: customerId}),
            headers: {'Content-Type': 'application/json'}
          }).on('complete', function(data, response) {
            if (!response) {
              callback(true, 'Got no response trying to create user');
              return;
            }
            console.log('Create User ' + customerId + ': Status Code = ' + response.status);
            if (response.statusCode == 200) {
              callback(null, customerId);
            } else {
              callback(true, 'Creating user was not successful');
            }
          });
        } else {
          callback(null, customerId);
        }
      });
    },
    function(customerId, callback) {
      rest.postJson(couchUrl + '_session', {
        name: customerId
      }).on('complete', function(data, response) {
        if (!response) {
          callback(true, 'Got no response trying to create session');
          return;
        }
        if (response.statusCode == 200) {
          callback(null, data);
        } else {
          callback(true, 'Creating session was not successful');
        }
      });
    }
  ], function(err, results) {
    if (err) {
      res.status(400).send('OH NO!' + results);
    } else {
      res.status(200).send(results);
    }
  });
});

module.exports = app;
