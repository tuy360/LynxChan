'use strict';

var crypto = require('crypto');
var db = require('./db');
var cachedFiles = db.files();
var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;
var cachedPosts = db.posts();
var cachedThreads = db.threads();
var cachedBoards = db.boards();
var cachedTorIps = db.torIps();
var cachedBans = db.bans();

// Added on 0.4.3
// Section 1: Mime pre-aggregation on upload data on postings {
function setPostingPreAggregatedFileMime(posting, collection, callback) {

  var files = [];

  for (var i = 0; i < posting.files.length; i++) {
    files.push(posting.files[i].path);
  }

  cachedFiles.find({
    filename : {
      $in : files
    }
  }, {
    filename : 1,
    contentType : 1
  }).toArray(function(error, foundFiles) {
    if (error) {
      callback(error);
    } else {

      var fileRelation = {};

      for (i = 0; i < foundFiles.length; i++) {
        var file = foundFiles[i];

        fileRelation[file.filename] = file.contentType;
      }

      for (i = 0; i < posting.files.length; i++) {
        posting.files[i].mime = fileRelation[posting.files[i].path];
      }

      collection.updateOne({
        _id : new ObjectID(posting._id)
      }, {
        $set : {
          files : posting.files
        }
      }, callback);

    }
  });

}

function setPostsPreAggreGatedFileMime(callback, cursor) {
  if (!cursor) {
    cursor = cachedPosts.find({
      'files.0' : {
        $exists : true
      }
    }, {
      files : 1
    });

  }

  cursor.next(function(error, post) {
    if (error) {
      callback(error);
    } else if (!post) {
      callback();
    } else {

      // style exception, too simple
      setPostingPreAggregatedFileMime(post, cachedPosts, function updatedMimes(
          error) {
        if (error) {
          callback(error);
        } else {
          setPostsPreAggreGatedFileMime(callback, cursor);
        }
      });
      // style exception, too simple

    }
  });
}

exports.setThreadsPreAggregatedFileMime = function(callback, cursor) {

  if (!cursor) {
    cursor = cachedThreads.find({
      'files.0' : {
        $exists : true
      }
    }, {
      files : 1
    });

  }

  cursor.next(function(error, thread) {
    if (error) {
      callback(error);
    } else if (!thread) {
      setPostsPreAggreGatedFileMime(callback);
    } else {

      // style exception, too simple
      setPostingPreAggregatedFileMime(thread, cachedThreads,
          function updatedMimes(error) {
            if (error) {
              callback(error);
            } else {
              exports.setThreadsPreAggregatedFileMime(callback, cursor);
            }
          });
      // style exception, too simple

    }
  });

};
// } Section 1: Mime pre-aggregation on upload data on postings

// Added on 0.5.1
// Section 2: Board salt creation {
exports.setBoardIpSalt = function(callback) {

  cachedBoards.find({}, {}).toArray(
      function gotBoards(error, boards) {
        if (error || !boards.length) {
          callback(error);
        } else {
          var operations = [];

          for (var i = 0; i < boards.length; i++) {
            var board = boards[i];

            operations.push({
              updateOne : {
                filter : {
                  boardUri : board.boardUri
                },
                update : {
                  $set : {
                    ipSalt : crypto.createHash('sha256').update(
                        JSON.stringify(board) + Math.random() + new Date())
                        .digest('hex')
                  }
                }
              }
            });
          }

          cachedBoards.bulkWrite(operations, callback);

        }
      });

};
// } Section 2: Board salt creation

// Added on 1.0.6
// Section 3: Ip conversion from strings to array of ints {
function convertIp(ip) {

  if (!ip) {
    return null;
  }

  var newIp = [];

  var converted = ip.trim().split('.');

  for (var i = 0; i < converted.length; i++) {
    var part = +converted[i];

    if (!isNaN(part) && part <= 255 && part >= 0) {
      newIp.push(part);
    }
  }

  return newIp;

}

function migrateTorIps(callback) {

  cachedTorIps.find().toArray(function gotTorIps(error, ips) {
    if (error) {
      callback(error);
    } else {

      var operations = [];

      for (var i = 0; i < ips.length; i++) {
        var ip = ips[i];

        operations.push({
          updateOne : {
            filter : {
              _id : new ObjectID(ip._id)
            },
            update : {
              $set : {
                ip : convertIp(ip.ip)
              }
            }
          }
        });

      }

      if (operations.length) {
        cachedTorIps.bulkWrite(operations, callback);

      } else {
        callback();
      }

    }
  });

}

function fixTorIpsIndex(callback) {

  cachedTorIps.dropIndex('ip_1', function indexesDropped(error) {
    if (error) {
      callback(error);
    } else {

      // style exception, too simple
      cachedTorIps.ensureIndex({
        ip : 1
      }, function setIndex(error, index) {
        if (error) {
          callback(error);

        } else {
          migrateTorIps(callback);
        }
      });
      // style exception, too simple

    }

  });

}

function migrateBanIps(callback) {

  cachedBans.find({}, {
    ip : 1,
    range : 1
  }).toArray(function gotBans(error, bans) {
    if (error) {
      callback(error);
    } else {

      var operations = [];

      for (var i = 0; i < bans.length; i++) {
        var ban = bans[i];

        var setBlock;

        if (ban.ip) {
          setBlock = {
            ip : convertIp(ban.ip)
          };
        } else {
          setBlock = {
            range : convertIp(ban.range)
          };
        }

        operations.push({
          updateOne : {
            filter : {
              _id : new ObjectID(ban._id)
            },
            update : {
              $set : setBlock
            }
          }
        });

      }

      if (operations.length) {
        // style exception, too simple
        cachedBans.bulkWrite(operations, function migratedIps(error) {
          if (error) {
            callback(error);
          } else {
            fixTorIpsIndex(callback);
          }
        });
        // style exception, too simple

      } else {
        fixTorIpsIndex(callback);
      }

    }
  });

}

function migratePostIps(callback) {

  cachedPosts.find({
    ip : {
      $exists : true
    }
  }, {
    ip : 1
  }).toArray(function gotPosts(error, posts) {
    if (error) {
      callback(error);
    } else {
      var operations = [];

      for (var i = 0; i < posts.length; i++) {
        var post = posts[i];

        operations.push({
          updateOne : {
            filter : {
              _id : new ObjectID(post._id)
            },
            update : {
              $set : {
                ip : convertIp(post.ip)
              }
            }
          }
        });
      }

      if (operations.length) {
        // style exception, too simple
        cachedPosts.bulkWrite(operations, function wroteIps(error) {
          if (error) {
            callback(error);
          } else {
            migrateBanIps(callback);
          }
        });
        // style exception, too simple

      } else {
        migrateBanIps(callback);
      }
    }
  });
}

exports.migrateThreadIps = function(callback) {

  cachedThreads.find({
    ip : {
      $exists : true
    }
  }, {
    ip : 1
  }).toArray(function gotThreads(error, threads) {
    if (error) {
      callback(error);
    } else {

      var operations = [];

      for (var i = 0; i < threads.length; i++) {
        var thread = threads[i];

        operations.push({
          updateOne : {
            filter : {
              _id : new ObjectID(thread._id)
            },
            update : {
              $set : {
                ip : convertIp(thread.ip)
              }
            }
          }
        });
      }

      if (operations.length) {

        // style exception, too simple
        cachedThreads.bulkWrite(operations, function wroteIps(error) {
          if (error) {
            callback(error);
          } else {
            migratePostIps(callback);
          }
        });
        // style exception, too simple

      } else {
        migratePostIps(callback);
      }
    }
  });
};
// } Section 3: Ip conversion from strings to array of ints