'use strict';

var conn;
var files;

var mongo = require('mongodb');
var gridFsHandler;
var formOps;
var miscOps;
var domManipulator;
var boot = require('./boot');
var verbose = boot.getGeneralSettings().verbose;
var debug = boot.debug();

exports.reload = function() {
  formOps = require('./engine/formOps');
  gridFsHandler = require('./engine/gridFsHandler');
  domManipulator = require('./engine/domManipulator');
  miscOps = require('./engine/miscOps');
};

function handleNoSettingsError(callback) {
  var error = 'Archive settings could not be found. Setup it or disable ';
  error += 'archiving options.';

  if (verbose) {
    console.log(error);
  }

  if (debug) {
    throw error;
  }

  callback();
}

function handleSamePlaceError(callback) {

  var error = 'You can\'t use the same database on the same server to store ';
  error += 'both the archive and the regular files.';

  if (verbose) {
    console.log(error);
  }

  if (debug) {
    throw error;
  }

  callback();

}

function assembleConnectString(dbSettings) {
  var connectString = 'mongodb://';

  if (dbSettings.user) {
    connectString += dbSettings.user + ':' + dbSettings.password + '@';
  }

  connectString += dbSettings.address + ':';
  connectString += dbSettings.port + '/' + dbSettings.db;

  return connectString;
}

exports.init = function(callback) {

  var dbSettings = require('./boot').getArchiveSettings();

  if (!dbSettings) {
    handleNoSettingsError(callback);

    return;
  }

  var mainDbSettings = require('./boot').getDbSettings();

  var equalAddress = mainDbSettings.address === dbSettings.address;

  if (equalAddress && mainDbSettings.db === dbSettings.db) {
    handleSamePlaceError(callback);
    return;
  }

  mongo.MongoClient.connect(assembleConnectString(dbSettings),
      function connectedDb(error, db) {

        if (error) {
          callback(error);
        } else {

          formOps = require('./engine/formOps');
          gridFsHandler = require('./engine/gridFsHandler');
          domManipulator = require('./engine/domManipulator');
          miscOps = require('./engine/miscOps');

          conn = db;

          files = db.collection('fs.files');

          callback();
        }

      });

};

// start of archiving data
function writeDataOnOpenFile(gs, data, callback) {

  gs.write(data, true, function wroteData(error) {

    callback(error);

  });

}

exports.archiveData = function(data, destination, mime, meta, callback) {

  if (verbose) {
    console.log('Archiving data under \'' + destination + '\'');
  }

  var gs = mongo.GridStore(conn, destination, 'w', {
    'content_type' : mime,
    metadata : meta
  });

  exports.removeFiles(destination, function clearedFile(error) {
    if (error) {
      callback(error);
    } else {

      // style exception, the parent callback is too simple
      gs.open(function openedGs(error, gs) {

        if (error) {
          callback(error);
        } else {
          writeDataOnOpenFile(gs, data, callback);
        }
      });

    }
    // style exception, the parent callback is too simple

  });

};
// end of archiving data

// start or archiving file
function writeFileOnOpenFile(gs, path, callback) {

  gs.writeFile(path, function wroteFile(error) {

    // style exception, too simple
    gs.close(function closed(closeError, result) {
      callback(error || closeError);
    });
    // style exception, too simple

  });
}

exports.writeFile = function(path, destination, mime, meta, callback) {

  if (verbose) {
    var message = 'Archiving ' + mime + ' file under \'';
    message += destination + '\'';
    console.log(message);
  }

  var gs = mongo.GridStore(conn, destination, 'w', {
    'content_type' : mime,
    metadata : meta
  });

  exports.removeFiles(destination, function clearedFile(error) {
    if (error) {
      callback(error);
    } else {

      // style exception, too simple
      gs.open(function openedGs(error, gs) {

        if (error) {
          callback(error);
        } else {
          writeFileOnOpenFile(gs, path, callback);
        }
      });
      // style exception, too simple

    }
  });

};
// end of archiving data

exports.removeFiles = function(name, callback) {

  mongo.GridStore.unlink(conn, name, function deleted(error) {
    if (callback) {
      callback(error);
    }

  });
};

// start of outputting file
function shouldOutput304(lastSeen, filestats) {

  var mTimeMatches = lastSeen === filestats.uploadDate.toString();

  return mTimeMatches && !filestats.metadata.status;
}

// retry means it has already failed to get a page and now is trying to get the
// 404 page. It prevents infinite recursion
exports.outputFile = function(file, req, res, callback, retry) {

  if (verbose) {
    console.log('Outputting \'' + file + '\' from archive');
  }

  var lastSeen = req.headers ? req.headers['if-modified-since'] : null;

  files.findOne({
    filename : file
  }, {
    uploadDate : 1,
    'metadata.status' : 1,
    'metadata.type' : 1,
    length : 1,
    contentType : 1,
    filename : 1,
    _id : 0
  }, function gotFile(error, fileStats) {
    if (error) {
      callback(error);
    } else if (!fileStats) {
      if (retry) {
        callback({
          code : 'ENOENT'
        });
      } else {
        gridFsHandler.outputFile('/404.html', req, res, callback, true);
      }

    } else if (shouldOutput304(lastSeen, fileStats)) {
      if (verbose) {
        console.log('304');

      }
      res.writeHead(304);
      res.end();
    } else {
      gridFsHandler.streamFile(fileStats, req, callback, null, res, conn);
    }
  });

};

exports.mainArquive = function(req, res) {

  files.aggregate([ {
    $match : {
      'metadata.type' : 'thread'
    }
  }, {
    $sort : {
      'metadata.boardUri' : -1
    }
  }, {
    $group : {
      _id : 0,
      boards : {
        $addToSet : '$metadata.boardUri'
      }
    }
  } ], function gotAvailableBoards(error, results) {
    if (error) {
      formOps.outputError(error, 500, res);
    } else {

      var availableBoards = results.length ? results[0].boards : [];

      res.writeHead(200, miscOps.corsHeader('text/html'));

      res.end(domManipulator.mainArchive(availableBoards));

    }
  });

};

exports.boardArquive = function(board, req, res) {

  files.aggregate([ {
    $match : {
      'metadata.type' : 'thread',
      'metadata.boardUri' : board
    }
  }, {
    $sort : {
      'metadata.threadId' : -1
    }
  }, {
    $group : {
      _id : 0,
      threads : {
        $addToSet : '$metadata.threadId'
      }
    }
  } ], function gotAvailableThreads(error, results) {
    if (error) {
      formOps.outputError(error, 500, res);
    } else {

      var availableThreads = results.length ? results[0].threads : [];

      res.writeHead(200, miscOps.corsHeader('text/html'));

      res.end(domManipulator.boardArchive(board, availableThreads));

    }
  });

};