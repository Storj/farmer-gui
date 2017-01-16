/**
 * @module storjshare/renderer
 */

'use strict';

const dnode = require('dnode');
const {ipcRenderer: ipc} = require('electron');
const {EventEmitter} = require('events');
const UserData = require('./lib/userdata');

window.UserData = UserData.toObject();
window.$ = window.jQuery = require('jquery');
window.Vue = require('vue');
window.ViewEvents = new EventEmitter(); // NB: For view-to-view communication

require('bootstrap');
require('./lib/helpers')
  .ExternalLinkListener().bind(document);

// NB: When settings change, notify the main process
UserData.on('settingsUpdated', (updatedSettings) => {
  ipc.send('appSettingsChanged', updatedSettings);
});

/**
 * Registers the views from their schemas
 */
function registerView(schemaPath) {
  return new window.Vue(require(schemaPath));
}

window.daemonSocket = dnode.connect(45015, (rpc) => {

  // NB: Add global reference to the daemon RPC
  window.daemonRpc = rpc;

  // NB: Register all the application views
  registerView('./views/about');
  registerView('./views/updater');
  registerView('./views/overview');
  registerView('./views/footer');
  registerView('./views/terms');

  // NB: Check user data for application settings and signal appropriate
  // NB: messages to the main process
  if (!window.UserData.appSettings.silentMode) {
    ipc.send('showApplicationWindow');
  }

});
