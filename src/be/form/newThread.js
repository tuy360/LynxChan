'use strict';

var formOps = require('../engine/formOps');
var bypassOps = require('../engine/bypassOps');
var postingOps = require('../engine/postingOps').thread;
var captchaOps = require('../engine/captchaOps');
var lang = require('../engine/langOps').languagePack();
var mandatoryParameters = [ 'message', 'boardUri' ];

function createThread(req, userData, parameters, captchaId, res, auth) {
  postingOps.newThread(req, userData, parameters, captchaId,
      function threadCreated(error, id) {
        if (error) {
          formOps.outputError(error, 500, res);
        } else {
          var redirectLink = '../' + parameters.boardUri;
          redirectLink += '/res/' + id + '.html';
          formOps.outputResponse(lang.msgThreadCreated, redirectLink, res,
              null, auth);
        }
      });

}

function checkBans(req, res, parameters, userData, captchaId, auth) {

  if (formOps.checkBlankParameters(parameters, mandatoryParameters, res)) {
    return;
  }

  formOps.checkForBan(req, parameters.boardUri, res,
      function checkedBan(error) {

        if (error) {
          formOps.outputError(error, 500, res);
        } else {

          // style exception, too simple
          formOps
              .checkForHashBan(parameters, req, res,
                  function checkedHashBans(error) {
                    if (error) {
                      formOps.outputError(error, 500, res);
                    } else {
                      createThread(req, userData, parameters, captchaId, res,
                          auth);
                    }
                  });
          // style exception, too simple

        }

      }, auth);

}

function useBypass(req, res, parameters, userData, captchaId, bypassId, auth) {

  bypassOps.useBypass(bypassId, req, function usedBypass(error) {

    if (error) {
      formOps.outputError(error, 500, res);
    } else {
      checkBans(req, res, parameters, userData, captchaId, auth);
    }
  });
}

exports.process = function(req, res) {

  formOps.getAuthenticatedPost(req, res, true, function gotData(auth, userData,
      parameters) {

    var cookies = formOps.getCookies(req);

    useBypass(req, res, parameters, userData, cookies.captchaid,
        cookies.bypass, auth);
  }, true);

};