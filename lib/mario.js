/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global Services: false, XPCOMUtils: false, bmsvc: false */
'use strict';

let prefs = require('sdk/simple-prefs');
let self = require('sdk/self');
const { setTimeout } = require('sdk/timers');

const { Cu, Cr, Ci } = require('chrome');

const MARIO_PREF = 'mario';
const COIN_URL = self.data.url('coin.mp3');
const INVINCIBLE_URL = self.data.url('invincible.mp3');
const PAINT_FLASHING_PREF = 'nglayout.debug.paint_flashing';
// Things like sync can cause Firefox to add many, many bookmarks
// all at once. This can cause many coins to play simultaniously
// which sounds horrible and annoying as opposed to whimsical and
// hilarious.
const COIN_REPLAY_TIME = 5000; // milliseconds

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyServiceGetter(this, 'bmsvc',
  '@mozilla.org/browser/nav-bookmarks-service;1',
  'nsINavBookmarksService');

// Hack alert - in order to play audio, we need to use the
// Audio API that's available in content scripts. The problem
// is that the coin.mp3 file is a resource:// url which
// about:blank is not privledged enough to access. about:about,
// however, is privledged, _and_ can run audio. I felt this was
// better than piping over a data URI.
let pageWorker = require('sdk/page-worker').Page({
  contentScriptFile: self.data.url('audio-content.js'),
  contentURL: 'about:about'
});

var ready = false;
var isPastCoinReplayTime = true;

pageWorker.port.on('loaded', function() {
  ready = true;
});

let coinObserver = {
  onBeginUpdateBatch: function() {},
  onEndUpdateBatch: function() {},
  onItemAdded: function() {
    if (ready && isPastCoinReplayTime) {
      pageWorker.port.emit('play-once', {
        url: COIN_URL
      });

      isPastCoinReplayTime = false;

      setTimeout(() => {
        isPastCoinReplayTime = true;
      }, COIN_REPLAY_TIME);
    }
  },
  onItemRemoved: function() {},
  onItemChanged: function() {},
  onItemVisited: function() {},
  onItemMoved: function() {},
  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsINavBookmarkObserver) ||
        iid.equals(Ci.nsISupports)) {
      return this;
    }
    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};

let invincibilityObserver = {
  observe: function(aSubject, aTopic, aData) {
    if (aTopic === 'nsPref:changed' &&
        aData === PAINT_FLASHING_PREF) {
      if (Services.prefs.getBoolPref(PAINT_FLASHING_PREF)) {
        this.startAudio();
      } else {
        this.stopAudio();
      }
    }
  },

  startAudio: function() {
    pageWorker.port.emit('play-loop', {
      url: INVINCIBLE_URL
    });
  },

  stopAudio: function() {
    pageWorker.port.emit('play-loop-stop', {
      url: INVINCIBLE_URL
    });
  }
};

var run = function () {
  bmsvc.addObserver(coinObserver, false);
  Services.prefs.addObserver(PAINT_FLASHING_PREF,
                             invincibilityObserver, false);
};

var stop = function () {
  bmsvc.removeObserver(coinObserver);
  invincibilityObserver.stopAudio();
  Services.prefs.removeObserver(PAINT_FLASHING_PREF,
                                invincibilityObserver, false);
};

let listener = function () {
  if (prefs.prefs.mario) {
    run();
  } else {
    stop();
  }
};

exports.load = function () {
  prefs.on(MARIO_PREF, listener);
  listener();
};

exports.unload = function () {
  prefs.removeListener(MARIO_PREF, listener);
};
