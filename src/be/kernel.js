'use strict';

// Starting point of the application.
// Controls the workers.

var cluster = require('cluster');
var db;
var overboard;
var fs = require('fs');
var settingsHandler = require('./settingsHandler');
var verbose;
var generator;

var reloadDirectories = [ 'engine', 'form', 'api', 'addons' ];
var reloadIgnore = [ 'index.js', '.ignore', '.git', 'dont-reload' ];

var MINIMUM_WORKER_UPTIME = 5000;
var forkTime = {};

var defaultFilesArray;
var defaultImages = [ 'thumb', 'audioThumb', 'defaultBanner', 'spoiler' ];

var defaultFilesRelation;

var genericThumb;
var defaultBanner;
var genericAudioThumb;
var spoilerImage;

function reloadDirectory(directory) {

  var dirListing = fs.readdirSync(directory);

  for (var i = 0; i < dirListing.length; i++) {

    var module = dirListing[i];

    if (reloadIgnore.indexOf(module.toLowerCase()) === -1) {

      var fullPath = directory + '/' + module;

      var stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        reloadDirectory(fullPath);
      }

      delete require.cache[require.resolve(fullPath)];
    }
  }

}

exports.reload = function() {

  for (var i = 0; i < reloadDirectories.length; i++) {

    reloadDirectory(__dirname + '/' + reloadDirectories[i]);

  }

  settingsHandler.loadSettings();

  checkImagesSet();

  setDefaultImages();

  verbose = settingsHandler.getGeneralSettings().verbose;

  exports.startEngine();

  require('./archive').reload();

  if (cluster.isMaster) {
    overboard.reload();
    require('./scheduleHandler').reload();
    require('./generationQueue').reload();
  } else {
    require('./workerBoot').reload();
  }

};

var informedArguments = {
  debug : {
    short : '-d',
    long : '--debug',
    type : 'boolean'
  },
  torDebug : {
    short : '-td',
    long : '--tor-debug',
    type : 'boolean'
  },
  maintenance : {
    short : '-m',
    long : '--maintenance',
    type : 'value'
  },
  noDaemon : {
    short : '-nd',
    long : '--no-daemon',
    type : 'boolean'
  },
  setRole : {
    short : '-sr',
    long : '--set-role',
    type : 'boolean'
  },
  createAccount : {
    short : '-ca',
    long : '--create-account',
    type : 'boolean'
  },
  reload : {
    short : '-r',
    long : '--reload',
    type : 'boolean'
  },
  reloadBoards : {
    short : '-rboard',
    long : '--reload-boards',
    type : 'boolean'
  },
  reloadPreviews : {
    short : '-rp',
    long : '--reload-previews',
    type : 'boolean'
  },
  reloadLogin : {
    short : '-rl',
    long : '--reload-login',
    type : 'boolean'
  },
  reloadLogs : {
    short : '-rlog',
    long : '--reload-logs',
    type : 'boolean'
  },
  reloadBanner : {
    short : '-rb',
    long : '--reload-banner',
    type : 'boolean'
  },
  reloadFront : {
    short : '-rf',
    long : '--reload-front',
    type : 'boolean'
  },
  reloadOverboard : {
    short : '-ro',
    long : '--reload-overboard',
    type : 'boolean'
  },
  reloadNotFound : {
    short : '-rn',
    long : '--reload-notfound',
    type : 'boolean'
  },
  reloadAudio : {
    short : '-ra',
    long : '--reload-audio',
    type : 'boolean'
  },
  reloadThumb : {
    short : '-rt',
    long : '--reload-thumb',
    type : 'boolean'
  },
  reloadSpoiler : {
    short : '-rs',
    long : '--reload-spoiler',
    type : 'boolean'
  },
  reloadMaintenance : {
    short : '-rm',
    long : '--reload-maintenance',
    type : 'boolean'
  },
  login : {
    short : '-l',
    long : '--login',
    type : 'value'
  },
  password : {
    short : '-p',
    long : '--password',
    type : 'value'
  },
  globalRole : {
    short : '-gr',
    long : '--global-role',
    type : 'value'
  }
};

var args = process.argv;

for ( var key in informedArguments) {

  var element = informedArguments[key];

  switch (element.type) {
  case 'value':
    var elementIndex = args.indexOf(element.short);
    if (elementIndex === -1) {
      elementIndex = args.indexOf(elementIndex);
    }

    if (elementIndex !== -1) {
      element.value = args[elementIndex + 1];
    }
    break;
  case 'boolean':
    element.informed = args.indexOf(element.short) > -1;

    if (!element.informed) {
      element.informed = args.indexOf(element.long) > -1;
    }

    break;
  }

}

var optionalReloads = [ {
  generatorFunction : 'overboard',
  generatorModule : 'global',
  command : informedArguments.reloadOverboard.informed
}, {
  generatorFunction : 'previews',
  generatorModule : 'board',
  command : informedArguments.reloadPreviews.informed
}, {
  generatorFunction : 'logs',
  generatorModule : 'global',
  command : informedArguments.reloadLogs.informed
}, {
  generatorFunction : 'boards',
  generatorModule : 'board',
  command : informedArguments.reloadBoards.informed
} ];

var debug = informedArguments.debug.informed;
var noDaemon = informedArguments.noDaemon.informed;

var informedLogin = informedArguments.login.value;
var informedPassword = informedArguments.password.value;
var informedRole = informedArguments.globalRole.value;

var createAccount = informedArguments.createAccount.informed;

exports.genericThumb = function() {
  return genericThumb;
};

exports.genericAudioThumb = function() {
  return genericAudioThumb;
};

exports.spoilerImage = function() {
  return spoilerImage;
};

exports.defaultBanner = function() {
  return defaultBanner;
};

exports.debug = function() {
  return debug;
};

exports.torDebug = function() {
  return informedArguments.torDebug.informed;
};

function checkImagesSet() {

  var templateSettings = settingsHandler.getTemplateSettings();

  for (var i = 0; i < defaultImages.length; i++) {

    var image = defaultImages[i];

    if (!templateSettings[image]) {
      var error = 'Template image ' + image;
      error += ' not set on the template settings.';
      throw error;
    }
  }
}

function setDefaultImages() {

  var templateSettings = settingsHandler.getTemplateSettings();

  var thumbExt = templateSettings.thumb.split('.');

  thumbExt = thumbExt[thumbExt.length - 1].toLowerCase();

  genericThumb = '/genericThumb' + '.' + thumbExt;

  var audioThumbExt = templateSettings.audioThumb.split('.');

  audioThumbExt = audioThumbExt[audioThumbExt.length - 1].toLowerCase();

  genericAudioThumb = '/audioGenericThumb' + '.' + audioThumbExt;

  var bannerExt = templateSettings.defaultBanner.split('.');

  bannerExt = bannerExt[bannerExt.length - 1].toLowerCase();

  defaultBanner = '/defaultBanner' + '.' + bannerExt;

  var spoilerExt = templateSettings.spoiler.split('.');

  spoilerExt = spoilerExt[spoilerExt.length - 1].toLowerCase();

  spoilerImage = '/spoiler' + '.' + spoilerExt;
}

function composeDefaultFiles() {
  defaultFilesArray = [ '/', '/404.html', genericThumb, '/login.html',
      defaultBanner, spoilerImage, '/maintenance.html', genericAudioThumb ];

  defaultFilesRelation = {
    '/' : {
      generatorModule : 'global',
      generatorFunction : 'frontPage',
      command : informedArguments.reloadFront.informed
    },
    '/404.html' : {
      generatorModule : 'global',
      generatorFunction : 'notFound',
      command : informedArguments.reloadNotFound.informed
    },
    '/login.html' : {
      generatorModule : 'global',
      generatorFunction : 'login',
      command : informedArguments.reloadLogin.informed
    },
    '/maintenance.html' : {
      generatorModule : 'global',
      generatorFunction : 'maintenance',
      command : informedArguments.reloadMaintenance.informed
    }
  };

  defaultFilesRelation[genericThumb] = {
    generatorFunction : 'thumb',
    generatorModule : 'global',
    command : informedArguments.reloadThumb.informed
  };

  defaultFilesRelation[spoilerImage] = {
    generatorFunction : 'spoiler',
    generatorModule : 'global',
    command : informedArguments.reloadSpoiler.informed
  };

  defaultFilesRelation[defaultBanner] = {
    generatorFunction : 'defaultBanner',
    generatorModule : 'global',
    command : informedArguments.reloadBanner.informed
  };

  defaultFilesRelation[genericAudioThumb] = {
    generatorFunction : 'audioThumb',
    generatorModule : 'global',
    command : informedArguments.reloadAudio.informed
  };

}

exports.noDaemon = function() {
  return noDaemon;
};

function processBulkRebuild(message, genQueue) {
  exports.reload();

  for (var i = 0; i < message.rebuilds.length; i++) {

    var rebuild = message.rebuilds[i];

    if (rebuild.overboard) {
      overboard.reaggregate(rebuild);
    } else {
      genQueue.queue(rebuild);

    }

  }
}

// after everything is all right, call this function to start the workers
function bootWorkers() {

  var genQueue = require('./generationQueue');

  if (noDaemon) {
    db.conn().close();
    return;
  }

  var workerLimit;

  var coreCount = require('os').cpus().length;

  if (debug && coreCount > 2) {
    workerLimit = 2;
  } else {
    workerLimit = coreCount;
  }

  for (var i = 0; i < workerLimit; i++) {
    cluster.fork();
  }

  cluster.on('fork', function(worker) {

    forkTime[worker.id] = new Date().getTime();

    worker.on('message', function receivedMessage(message) {

      if (message.upStream) {
        message.upStream = false;

        if (message.reload) {
          processBulkRebuild(message, genQueue);
        }

        for ( var id in cluster.workers) {
          cluster.workers[id].send(message);
        }

      } else if (message.overboard) {
        overboard.reaggregate(message);
      } else {
        genQueue.queue(message);
      }

    });
  });

  cluster.on('exit', function(worker, code, signal) {
    console.log('Server worker ' + worker.id + ' crashed.');

    if (new Date().getTime() - forkTime[worker.id] < MINIMUM_WORKER_UPTIME) {
      console.log('Crash on boot, not restarting it.');
    } else {
      cluster.fork();
    }

    delete forkTime[worker.id];
  });
}

function regenerateAll() {

  generator.all(function regeneratedAll(error) {
    if (error) {

      if (verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }

    } else {
      bootWorkers();
    }
  });

}

function iterateOptionalReloads(index) {

  index = index || 0;

  if (index >= optionalReloads.length) {
    bootWorkers();

    return;
  }

  var toCheck = optionalReloads[index];

  if (!toCheck.command) {
    iterateOptionalReloads(index + 1);
  } else {

    generator[toCheck.generatorModule][toCheck.generatorFunction]
        (function generated(error) {

          if (error) {

            if (verbose) {
              console.log(error);
            }

            if (debug) {
              throw error;
            }

          }

          iterateOptionalReloads(index + 1);

        });

  }

}

function iterateDefaultPages(foundFiles, index) {

  index = index || 0;

  if (index >= defaultFilesArray.length) {
    iterateOptionalReloads();
    return;

  }

  var fileToCheck = defaultFilesArray[index];

  var fileData = defaultFilesRelation[fileToCheck];

  if (foundFiles.indexOf(fileToCheck) === -1 || fileData.command) {
    generator[fileData.generatorModule][fileData.generatorFunction]
        (function generated(error) {
          if (error) {
            if (verbose) {
              console.log(error);
            }

            if (debug) {
              throw error;
            }
          } else {
            iterateDefaultPages(foundFiles, index + 1);
          }
        });
  } else {
    iterateDefaultPages(foundFiles, index + 1);
  }

}

// we need to check if the default pages can be found
function checkForDefaultPages() {

  generator = require('./engine/generator');

  if (informedArguments.reload.informed) {
    regenerateAll();
    return;
  }

  var files = db.files();

  files.aggregate({
    $match : {
      filename : {
        $in : defaultFilesArray
      }
    }
  }, {
    $project : {
      filename : 1,
      _id : 0
    }
  }, {
    $group : {
      _id : 1,
      pages : {
        $push : '$filename'
      }
    }
  }, function gotFiles(error, files) {
    if (error) {
      if (verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }
    } else if (files.length) {
      iterateDefaultPages(files[0].pages);
    } else {
      regenerateAll();
    }
  });

}

settingsHandler.loadSettings();

checkImagesSet();

setDefaultImages();

composeDefaultFiles();

verbose = settingsHandler.getGeneralSettings().verbose;

db = require('./db');

var createAccountFunction = function() {
  require('./engine/accountOps').registerUser({
    login : informedLogin,
    password : informedPassword
  }, function createdUser(error) {

    if (error) {

      console.log(error);

      if (debug) {
        throw error;
      }
    } else {
      console.log('Account ' + informedLogin + ' created.');

    }

    checkForDefaultPages();

  }, informedRole, true);

};

var setRoleFunction = function() {

  require('./engine/accountOps').setGlobalRole(null, {
    role : informedRole,
    login : informedLogin
  }, function setRole(error) {

    if (error) {
      console.log(error);
      if (debug) {
        throw error;
      }

    } else {
      console.log('Set role ' + informedRole + ' for ' + informedLogin + '.');
    }

    checkForDefaultPages();

  }, true);

};

// loads inter-modular dependencies in the engine by making sure every module is
// loaded to only then set references they might have between them
// vroom vroom :v
exports.startEngine = function() {

  var dirListing = fs.readdirSync(__dirname + '/engine');

  for (var i = 0; i < dirListing.length; i++) {
    require('./engine/' + dirListing[i]);
  }

  for (i = 0; i < dirListing.length; i++) {
    require('./engine/' + dirListing[i]).loadDependencies();
  }

  require('./engine/addonOps').startAddons();

  require('./engine/templateHandler').loadTemplates();

};

var socketLocation = settingsHandler.getGeneralSettings().tempDirectory;
socketLocation += '/unix.socket';

function checkMaintenanceMode() {

  var parsedValue = JSON.parse(informedArguments.maintenance.value) ? true
      : false;

  var current = settingsHandler.getGeneralSettings().maintenance ? true : false;

  var changed = parsedValue !== current;

  if (changed) {
    var client = new require('net').Socket();

    client.connect(socketLocation, function() {
      client.write(JSON.stringify({
        type : 'maintenance',
        value : parsedValue
      }));
      client.destroy();
    });
  }
}

function initTorControl() {

  require('./engine/torOps').init(function initializedTorControl(error) {
    if (error) {
      throw error;
    } else {
      if (!noDaemon) {
        require('./taskListener').start();
        require('./scheduleHandler').start();
      } else if (informedArguments.maintenance.value) {
        checkMaintenanceMode();
      }

      if (createAccount) {
        createAccountFunction();
      } else if (informedArguments.setRole.informed) {
        setRoleFunction();
      } else {
        checkForDefaultPages();
      }
    }
  });
}

function checkDbVersions() {

  db.checkVersion(function checkedVersion(error) {

    if (error) {
      throw error;
    } else {

      var overboard = settingsHandler.getGeneralSettings().overboard;

      if (overboard) {

        db.boards().findOne({
          boardUri : overboard
        }, function(error, board) {
          if (error) {
            throw error;
          } else if (board) {
            var toThrow = 'You will have to change your overboard uri';
            toThrow += ', there is already a board with this uri';

            throw toThrow;
          } else {
            initTorControl();
          }
        });

      } else {
        initTorControl();
      }
    }
  });
}

if (cluster.isMaster) {

  db.init(function bootedDb(error) {

    if (error) {
      throw error;
    } else {
      exports.startEngine();

      overboard = require('./overboardOps');

      checkDbVersions();
    }

  });

} else {

  process.on('message', function messageReceived(msg) {
    if (msg.reload) {
      exports.reload();
    }
  });

  require('./workerBoot').boot();
}

exports.broadCastTopDownReload = function() {
  exports.reload();

  for ( var id in cluster.workers) {
    cluster.workers[id].send({
      reload : true
    });
  }
};