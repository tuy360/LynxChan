'use strict';

// handles the final part of page generation. I created this so I would take
// some stuff out of generator.js since that file was becoming a huge mess

// also, manipulations that are not persistent are meant to be directly
// requested from this module

var gridFs = require('./gridFsHandler');
var serializer = require('jsdom').serializeDocument;
var verbose = require('../boot').getGeneralSettings().verbose;
var jsdom = require('jsdom').jsdom;
var boot = require('../boot');
var debug = boot.debug();
var fs = require('fs');
var frontPageTemplate;
var threadTemplate;
var boardTemplate;
var notFoundTemplate;
var messageTemplate;
var opTemplate;
var postTemplate;

require('jsdom').defaultDocumentFeatures = {
  FetchExternalResources : false,
  ProcessExternalResources : false,
  // someone said it might break stuff. If weird bugs, disable.
  MutationEvents : false
};

exports.loadTemplates = function() {

  var fePath = boot.getFePath() + '/templates/';
  var templateSettings = boot.getTemplateSettings();

  frontPageTemplate = fs.readFileSync(fePath + templateSettings.index);
  threadTemplate = fs.readFileSync(fePath + templateSettings.threadPage);
  boardTemplate = fs.readFileSync(fePath + templateSettings.boardPage);
  notFoundTemplate = fs.readFileSync(fePath + templateSettings.notFoundPage);
  messageTemplate = fs.readFileSync(fePath + templateSettings.messagePage);
  opTemplate = fs.readFileSync(fePath + templateSettings.opCell);
  postTemplate = fs.readFileSync(fePath + templateSettings.postCell);

};

exports.notFound = function(callback) {

  var document = jsdom(notFoundTemplate);

  gridFs.writeData(serializer(document), '/404.html', 'text/html', {
    status : 404
  }, callback);
};

exports.message = function(message, link) {

  try {

    var document = jsdom(messageTemplate);

    var messageLabel = document.getElementById('labelMessage');

    messageLabel.innerHTML = message;

    var redirectLink = document.getElementById('linkRedirect');

    redirectLink.href = link;

    var meta = document.createElement('META');

    meta.httpEquiv = 'refresh';
    meta.content = '3; url=' + link;

    document.getElementsByTagName('head')[0].appendChild(meta);

    return serializer(document);
  } catch (error) {
    if (verbose) {
      console.log('error ' + error);
    }

    if (debug) {
      throw error;
    }

    return error.toString;
  }

};

exports.frontPage = function(boards, callback) {

  if (verbose) {
    console.log('Got boards\n' + JSON.stringify(boards));
  }

  try {

    var document = jsdom(frontPageTemplate);

    var boardsDiv = document.getElementById('divBoards');

    for (var i = 0; i < boards.length; i++) {

      var board = boards[i];

      var link = document.createElement('a');

      link.href = board.boardUri;
      link.innerHTML = '/' + board.boardUri + '/ - ' + board.boardName;

      if (i) {
        boardsDiv.appendChild(document.createElement('br'));
      }

      boardsDiv.appendChild(link);

    }

    gridFs.writeData(serializer(document), '/', 'text/html', {}, callback);
  } catch (error) {
    callback(error);
  }
};

exports.thread = function(boardUri, boardData, threadData, posts, callback) {

  try {
    var document = jsdom(threadTemplate);

    var titleHeader = document.getElementById('labelName');

    titleHeader.innerHTML = boardUri;

    var descriptionHeader = document.getElementById('labelDescription');

    titleHeader.innerHTML = '/' + boardUri + '/ - ' + boardData.boardName;
    descriptionHeader.innerHTML = boardData.boardDescription;

    var boardIdentifyInput = document.getElementById('boardIdentifier');

    boardIdentifyInput.setAttribute('value', boardUri);

    var threadIdentifyInput = document.getElementById('threadIdentifier');

    threadIdentifyInput.setAttribute('value', threadData.threadId);

    addThread(document, threadData, posts, boardUri, true);

    var ownName = 'res/' + threadData.threadId + '.html';

    gridFs.writeData(serializer(document), '/' + boardUri + '/' + ownName,
        'text/html', {
          boardUri : boardUri,
          type : 'thread',
          threadId : threadData.threadId
        }, callback);
  } catch (error) {
    callback(error);
  }

};

function addPosts(document, posts, boardUri, threadId, innerPage) {

  var divThreads = document.getElementById('divPostings');

  for (var i = 0; i < posts.length; i++) {
    var postCell = document.createElement('div');
    postCell.innerHTML = postTemplate;
    postCell.setAttribute('class', 'postCell');

    var post = posts[i];

    for (var j = 0; j < postCell.childNodes.length; j++) {
      var node = postCell.childNodes[j];

      switch (node.id) {
      case 'labelName':
        node.innerHTML = post.name;
        break;
      case 'labelEmail':
        node.innerHTML = post.email;
        break;
      case 'labelSubject':
        node.innerHTML = post.subject;
        break;
      case 'labelCreated':
        node.innerHTML = post.creation;
        break;
      case 'divMessage':
        node.innerHTML = post.message;
        break;
      case 'linkSelf':
        postCell.id = post.postId;
        node.innerHTML = post.postId;
        var link = (innerPage ? '' : 'res/') + threadId + '.html#';
        node.href = link + post.postId;
        break;
      }
    }

    divThreads.appendChild(postCell);

  }

}

function addThread(document, thread, posts, boardUri, innerPage) {

  var threadCell = document.createElement('div');
  threadCell.innerHTML = opTemplate;
  threadCell.setAttribute('class', 'opCell');

  for (var i = 0; i < threadCell.childNodes.length; i++) {
    var node = threadCell.childNodes[i];

    switch (node.id) {
    case 'labelName':
      node.innerHTML = thread.name;
      break;
    case 'labelEmail':
      node.innerHTML = thread.email;
      break;
    case 'labelSubject':
      node.innerHTML = thread.subject;
      break;
    case 'labelCreated':
      node.innerHTML = thread.creation;
      break;
    case 'divMessage':
      node.innerHTML = thread.message;
      break;
    case 'linkSelf':
      node.innerHTML = thread.threadId;
      var link = (innerPage ? '' : 'res/') + thread.threadId + '.html#';
      node.href = link + thread.threadId;
      threadCell.id = thread.threadId;
      break;
    case 'linkReply':
      if (innerPage) {
        node.style.display = 'none';
      } else {
        node.href = 'res/' + thread.threadId + '.html';
      }
      break;

    }
  }

  document.getElementById('divPostings').appendChild(threadCell);

  addPosts(document, posts || [], boardUri, thread.threadId, innerPage);

}

function generateThreadListing(document, boardUri, page, threads, preview,
    callback) {

  var tempPreview = {};

  for (var i = 0; i < preview.length; i++) {

    tempPreview[preview[i]._id] = preview[i].preview;
  }

  preview = tempPreview;

  for (i = 0; i < threads.length; i++) {
    var thread = threads[i];

    addThread(document, thread, preview[thread.threadId], boardUri);

  }

  var ownName = page === 1 ? '' : page + '.html';

  gridFs.writeData(serializer(document), '/' + boardUri + '/' + ownName,
      'text/html', {
        boardUri : boardUri,
        type : 'board'
      }, callback);
}

function addPagesLinks(document, pageCount) {
  var pagesDiv = document.getElementById('divPages');

  for (var i = 0; i < pageCount; i++) {

    var pageName = i ? (i + 1) + '.html' : 'index.html';

    var link = document.createElement('a');
    link.href = pageName;
    link.innerHTML = i + 1;

    pagesDiv.appendChild(link);

  }
}

exports.page = function(board, page, threads, pageCount, boardData, preview,
    callback) {

  try {

    var document = jsdom(boardTemplate);

    var boardIdentifyInput = document.getElementById('boardIdentifier');

    boardIdentifyInput.setAttribute('value', board);

    var titleHeader = document.getElementById('labelName');

    titleHeader.innerHTML = board;

    var descriptionHeader = document.getElementById('labelDescription');

    titleHeader.innerHTML = '/' + board + '/ - ' + boardData.boardName;
    descriptionHeader.innerHTML = boardData.boardDescription;

    addPagesLinks(document, pageCount);

    generateThreadListing(document, board, page, threads, preview, callback);
  } catch (error) {
    callback(error);
  }
};