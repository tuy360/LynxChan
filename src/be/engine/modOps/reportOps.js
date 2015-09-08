'use strict';

var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;
var db = require('../../db');
var boards = db.boards();
var threads = db.threads();
var logs = db.logs();
var posts = db.posts();
var reports = db.reports();
var settings = require('../../boot').getGeneralSettings();
var logger = require('../../logger');
var multipleReports = settings.multipleReports;
var miscOps;
var moduleRoot;
var ipBan;
var common;
var captchaOps;
var lang;

var reportArguments = [ {
  field : 'reason',
  length : 256,
  removeHTML : true
} ];

exports.loadDependencies = function() {

  miscOps = require('../miscOps');
  moduleRoot = require('.');
  ipBan = moduleRoot.ipBan;
  common = moduleRoot.common;
  captchaOps = require('../captchaOps');
  lang = require('../langOps').languagePack();

};

// Section 1: Closed reports {
exports.readClosedReports = function(parameters, callback) {

  reports.find({
    closedBy : {
      $exists : true
    },
    global : parameters.boardUri ? false : true
  }, {
    boardUri : 1,
    threadId : 1,
    closedBy : 1,
    postId : 1,
    reason : 1,
    closing : 1
  }).sort({
    creation : -1
  }).toArray(callback);

};

exports.getClosedReports = function(userData, parameters, callback) {

  var isOnGlobalStaff = userData.globalRole <= miscOps.getMaxStaffRole();

  if (parameters.boardUri) {
    boards.findOne({
      boardUri : parameters.boardUri
    }, function gotBoard(error, board) {
      if (error) {
        callback(error);
      } else if (!board) {
        callback(lang.errBoardNotFound);
      } else if (!common.isInBoardStaff(userData, board)) {
        callback(lang.errDeniedBoardReportManagement);
      } else {
        exports.readClosedReports(parameters, callback);
      }
    });
  } else if (!isOnGlobalStaff) {
    callback(lang.errDeniedGlobalReportManagement);
  } else {
    exports.getClosedReports(parameters, callback);
  }

};
// } Section 1: Closed reports

// Section 2: Create report {
exports.createReport = function(req, report, reportedContent, parameters,
    callback) {

  var toAdd = {
    global : parameters.global,
    boardUri : report.board,
    threadId : +report.thread,
    creation : new Date()
  };

  if (parameters.reason) {
    toAdd.reason = parameters.reason;
  }

  if (report.post) {
    toAdd.postId = +report.post;
  }

  reports.insert(toAdd, function createdReport(error) {
    if (error && error.code !== 11000) {
      callback(error);
    } else {
      exports.iterateReports(req, reportedContent, parameters, callback);
    }
  });

};

exports.iterateReports = function(req, reportedContent, parameters, cb) {

  if (!reportedContent.length) {
    cb();
  } else if (reportedContent.length > 1 && !multipleReports) {
    cb(lang.errDeniedMultipleReports);
  } else {

    var report = reportedContent.shift();

    var uriToCheck = parameters.global ? null : report.board;

    ipBan.checkForBan(req, uriToCheck, function checkedForBan(error, ban) {
      if (error || ban) {
        cb(error, ban);
      } else {

        // style exception, too simple
        var queryBlock = {
          boardUri : report.board,
          threadId : +report.thread
        };

        var countCb = function(error, count) {
          if (error) {
            cb(error);
          } else if (!count) {
            exports.iterateReports(req, reportedContent, parameters, cb);
          } else {
            exports.createReport(req, report, reportedContent, parameters, cb);
          }

        };

        if (report.post) {

          queryBlock.postId = +report.post;

          posts.count(queryBlock, countCb);

        } else {
          threads.count(queryBlock, countCb);
        }
        // style exception, too simple

      }
    });
  }
};

exports.report = function(req, reportedContent, parameters, captchaId, cb) {

  miscOps.sanitizeStrings(parameters, reportArguments);

  captchaOps.attemptCaptcha(captchaId, parameters.captcha, null,
      function solvedCaptcha(error) {
        if (error) {
          cb(error);
        } else {
          exports.iterateReports(req, reportedContent, parameters, cb);
        }

      });

};
// } Section 2: Create report

// Section 3: Close report {
exports.updateReport = function(report, userData, callback) {
  reports.updateOne({
    _id : new ObjectID(report._id)
  }, {
    $set : {
      closedBy : userData.login,
      closing : new Date()
    }
  }, function closedReport(error) {
    if (error) {
      callback(error);
    } else

    {
      // style exception, too simple

      var pieces = lang.logReportClosure;

      var logMessage = pieces.startPiece.replace('{$login}', userData.login);

      if (report.global) {
        logMessage += pieces.globalPiece;
      }

      logMessage += pieces.midPiece;

      if (report.postId) {
        logMessage += pieces.postPiece.replace('{$post}', report.postId);
      }

      logMessage += pieces.finalPiece.replace('{$thread}', report.threadId)
          .replace('{$board}', report.boardUri).replace('{$reason}',
              report.reason);

      logs.insert({
        user : userData.login,
        global : report.global,
        description : logMessage,
        time : new Date(),
        boardUri : report.boardUri,
        type : 'reportClosure'
      }, function insertedLog(error) {
        if (error) {

          logger.printLogError(logMessage, error);
        }

        callback(null, report.global, report.boardUri);
      });

      // style exception, too simple
    }

  });
};

exports.closeReport = function(userData, parameters, callback) {

  var isOnGlobalStaff = userData.globalRole <= miscOps.getMaxStaffRole();

  try {
    reports.findOne({
      _id : new ObjectID(parameters.reportId)
    }, function gotReport(error, report) {
      if (error) {
        callback(error);
      } else if (!report) {
        callback(lang.errReportNotFound);
      } else if (report.closedBy) {
        callback(lang.errReportAlreadyClosed);
      } else if (report.global && !isOnGlobalStaff) {
        callback(lang.errDeniedGlobalReportManagement);
      } else if (!report.global) {

        // style exception, too simple
        boards.findOne({
          boardUri : report.boardUri
        }, function gotBoard(error, board) {
          if (error) {
            callback(error);
          } else if (!board) {
            callback(lang.errBoardNotFound);
          } else if (!common.isInBoardStaff(userData, board)) {
            callback(lang.errDeniedBoardReportManagement);
          } else {
            exports.updateReport(report, userData, callback);
          }

        });
        // style exception, too simple

      } else {
        exports.updateReport(report, userData, callback);
      }

    });
  } catch (error) {
    callback(error);
  }
};
// } Section 3: Close report

