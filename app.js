var async = require('async');
var rest = require('unirest');
var express = require('express');
var morgan = require('morgan');

function logError(status, message) {
  console.log("ERROR (" + status + "): " + message);
}

var app = express();

app.use(morgan(':method :url :status :response-time ms - SecureToken: :req[securetoken], Authorization: :req[authorization]\\n'));

app.delete('/flush/:bucket', function(req, res) {
  // Validate Authorization header exists
  var authorization = req.get('Authorization');
  if (!authorization) {
    var status = 400;
    var message = 'Authorization header is required';
    logError(status, message);
    res.status(status).send();
    return;
  }

  var headers = {
    'Authorization': authorization
  };

  var couchHost = process.env.COUCHBASE_SERVER_HOST || 'cbs';
  var couchUrl = 'http://' + couchHost + ':8091/pools/default/buckets/' + req.params.bucket + '/controller/doFlush';

  rest.post(couchUrl).end(function(response) {
    if (response.ok) {
      res.status(200).send(response.body);
    } else {
      res.status(response.status).send(response.body);
    }
  });
});

app.post('/session/:db', function(req, res) {
  // Validate Authorization header exists
  var authorization = req.get('Authorization');
  if (!authorization) {
    var status = 400;
    var message = 'Authorization header is required';
    logError(status, message);
    res.status(status).send(message);
    return;
  }

  // Validate SecureToken header exists
  var secureToken = req.get('SecureToken');
  if (!secureToken) {
    var status = 400;
    var message = 'SecureToken header is required';
    logError(status, message);
    res.status(status).send(message);
    return;
  }

  var headers = {
    'Authorization': authorization,
    'SecureToken': secureToken,
    'Accept': 'application/json'
  };

  var couchHost = process.env.COUCHBASE_SYNC_GATEWAY_HOST || 'cbsg';
  var couchUrl = 'http://' + couchHost + ':4985/' + req.params.db + '/';

  async.waterfall([
    // Ensure the database exists
    function(callback) {
      rest.get(couchUrl).end(function(response) {
        if (response.ok) {
          callback(null);
        } else {
          callback(404, 'The database ' + req.params.db + ' does not exist');
        }
      });
    },
    // Query the customer ID from USANA by requesting their volume report
    function(callback) {
      rest.get('https://www.usanabeta.com/usana-api/rest/volumeReport/current')
      .headers(headers)
      .end(function(response) {
        if (response.ok) {
          if (response.body.customerId) {
            callback(null, response.body.customerId);
          } else {
            var message = "ERROR: StatusCode="+response.status+"; Body="+JSON.stringify(response.body);
            callback(400, message);
          }
        } else {
          callback(response.status, 'Response: ' + response);
        }
      });
    },
    // Check to see if the user exists in the sync gateway
    function(customerId, callback) {
      rest.get(couchUrl + '_user/' + customerId).end(function(response) {
        if (response.ok) {
          callback(null, customerId, true);
        } else if (response.notFound) {
          callback(null, customerId, false);
        } else {
          callback(response.status, 'Error checking for existence of user ' + customerId);
        }
      });
    },
    // Create user if they don't exist
    function(customerId, exists, callback) {
      if (!exists) {
        rest.put(couchUrl + '_user/' + customerId)
        .header('Content-Type', 'application/json')
        .send({
          name: customerId,
          admin_channels: ["user-" + customerId]
        })
        .end(function(response) {
          if (response.ok) {
            callback(null, customerId);
          } else {
            callback(response.status, response);
          }
        });
      } else {
        // Pass on through
        callback(null, customerId);
      }
    },
    // Create a session
    function(customerId, callback) {
      rest.post(couchUrl + '_session')
      .header('Content-Type', 'application/json')
      .send({name: customerId})
      .end(function(response) {
        if (response.ok) {
          callback(null, response.body);
        } else {
          callback(response.status, 'Creating session was not successful');
        }
      });
    }
  ], function(err, results) {
    if (err) {
      logError(err, results);
      res.status(err).send(results);
    } else {
      res.status(200).send(results);
    }
  });
});

module.exports = app;
