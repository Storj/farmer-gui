/**
 * @module storjshare/store
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {homedir} = require('os');
const prettyms = require('pretty-ms');
const shell = require('electron').shell;
const storjshare = require('storjshare-daemon');
const storj = require('storj-lib');
const configMigrate = require('../lib/config-migrate');
const async = require('async');

const mkdirPSync = require('../lib/mkdirpsync');
const BASE_PATH = path.join(homedir(), '.config/storjshare');
const SNAPSHOT_PATH = path.join(BASE_PATH, 'gui.snapshot');
const LOG_PATH = path.join(BASE_PATH, 'logs');
const SHARE_PATH = path.join(BASE_PATH, 'shares');


class ShareList {
  constructor(rpc) {
    this.rpc = rpc;
    this.shares = [];
    this.errors = [];
    this.pollInterval = 10000;
    this.actions = {};

    this._getShareById = (id) => {
      let share = false;
      this.shares.forEach((elem) => {
        if(elem.id === id) {
          share = elem;
        }
      });

      return share;
    }

    this._getSharesById = (ids) => {
      let share = [];
      this.shares.forEach((elem) => {
        ids.forEach((id) => {
          if(elem.id === id) {
            share.push(elem);
          }
        });
      });

      return (share.length > 0) ? share : false;
    }

    this.actions.invalidate = (ids) => {
      this._getSharesById(ids).forEach((share) => {
        share.isValid = false;
      });
    };

    this.actions.status = (callback) => {
      this.rpc.status((err, shares) => {
        if(err) {
          this.errors.push(err);
        }

        this.shares = shares.map(_mapStatus);
        return callback(err, shares);
      });
    };

    this.actions.load = (callback) => {
      let returnedErr = null;

      this.rpc.load(SNAPSHOT_PATH, (err)=> {
        let snapFileDescriptor;
        if(err) {
          try {
            if(err.message.includes('ENOENT')) { //TODO: change to return err.code === 'ENOENT'upstream in daemon
              mkdirPSync(BASE_PATH);
              snapFileDescriptor = fs.openSync(SNAPSHOT_PATH, 'w');
              fs.writeFileSync(snapFileDescriptor, '[]');
              this.actions.load(callback);
            } else {
              returnedErr = err;
            }
          } catch(failedToCreateSnapErr) {
            this.errors.push(failedToCreateSnapErr);
            returnedErr = failedToCreateSnapErr;
          }
        }

        return callback(returnedErr);
      });
    };

    this.actions.poll = () => {
      let timer;
      return {
        start: (interval) => {
          this.pollInterval = interval || this.pollInterval;
          timer = setInterval(() => {
            this.actions.status(() => {});
          }, this.pollInterval);
        },
        stop: () => {
          clearInterval(timer);
        }
      };
    };

    /**
     * Takes the current state of a share's configuration and writes it to the
     * configuration path for the share to persist it
     * @param {Number} id
     */
    this.actions.update = (id) => {
      let share = this._getShareById(id);

      if (!share) {
        return this.errors.push(new Error('Cannot update configuration for invalid share'));
      }

      share.isValid = false;

      let configPath = share.path;
      let configBuffer = Buffer.from(
        JSON.stringify(share.config, null, 2)
      );

      try {
        storjshare.utils.validate(share.config);
        fs.writeFileSync(configPath, configBuffer);
      } catch (err) {
        return this.errors.push(err);
      }
    };

    /**
     * Updates the snapshot file with the current ids of shares, this should
     * be called anytime a share is added or removed
     */
    this.actions.save = () => {
      this.rpc.save(SNAPSHOT_PATH, (err) => {
        if (err) {
          return this.errors.push(err);
        }
      });
    };

    /**
     * Imports a share from the supplied configuration file path
     * @param {String} configPath
     */
    this.actions.import = (configPath, callback) => {
      let handleStart = (err) => {
        if (err) {
          this.errors.push(err);
        } else {
          this.actions.save();
        }

        return callback(err);
      };

      if (typeof configPath === 'string') {
        configPath = [configPath];
      }

      if (configMigrate.isLegacyConfig(configPath[0])) {
        let message = 'Configuration is in the legacy format. ' +
          ' Would you like to migrate it?';

        if (window.confirm(message)) {
          configPath = configMigrate.convertLegacyConfig(configPath[0]);
        } else {
          let error = new Error('Invalid configuration supplied');

          this.errors.push(error)
          return callback(error);
        }
      }

      async.each(configPath, (c, next) => {
        try {
          this.rpc.start(c, handleStart);
        } catch(err) {
          this.errors.push(err);
          return next(err);
        }
      }, callback);
    };

    /**
     * Starts/Restarts the share with the given index
     * @param {String[]} id
     */
    this.actions.start = (id) => {
      let list = [];
      if(typeof id === 'string') {
        list.push(id);
      } else if(Array.isArray(id)) {
        list = id;
      }

      this.actions.invalidate(list);

      list.forEach((id) => {
        this.rpc.restart(id, (err) => {
          if (err) {
            this.errors.push(err);
          }
        });
      });
    };

    /**
     * Stops the running share at the given index
     * @param {String[]} id
     */
    this.actions.stop = (id) => {
      let list = [];
      if(typeof id === 'string') {
        list.push(id);
      } else if(Array.isArray(id)) {
        list = id;
      }

      this.actions.invalidate(list);

      list.forEach((id) => {
        this.rpc.stop(id, (err) => {
          if (err) {
            this.errors.push(err);
          }
        });
      });
    };

    /**
     * Removes the share at the given index from the snapshot
     * @param {String[]} id
     */
    this.actions.destroy = (id) => {
      let list = [];
      if(typeof id === 'string') {
        list.push(id);
      } else if(Array.isArray(id)) {
        list = id;
      }

      this.actions.invalidate(list);

      list.forEach((id) => {
        if (!window.confirm(`Remove the share ${id}?`)) {
          return;
        }

        this.rpc.destroy(id, (err) => {
          if (err) {
            return this.errors.push(err);
          }
          this.actions.save();
        });
      });
    };

    this.actions.logs = (id) => {
      let share = this._getShareById(id);
      let loggerOutputFolder = path.normalize(share.config.loggerOutputFile);
      try {
        if (!fs.statSync(loggerOutputFolder).isDirectory()) {
          loggerOutputFolder = path.dirname(loggerOutputFolder);
        }
      } catch (err) {
        loggerOutputFolder = path.dirname(loggerOutputFolder);
      }

      if(share && share.config && loggerOutputFolder) {
        console.log(loggerOutputFolder);
        shell.showItemInFolder(loggerOutputFolder);
      } else {
        this.errors.push(new Error('Share is not configured to log output'));
      }
    };

    this.actions.edit = (id) => {
      let share = this._getShareById(id);
      if(share && share.path) {
        shell.openItem(path.normalize(share.path));
      } else {
        this.errors.push(new Error('Share path is configured incorrectly'));
      }
    };

    this.actions.clearErrors = () => {
      this.errors = [];
    };
  }
}

  /**
   * Takes a single share status object and returns a view model's version of
   * the share status - this method is automatically applied in the status
   * polling results.
   * @private
   * @param {Object} shareStatus
   */
function _mapStatus(share) {
  share.isValid = true;
  share.isErrored = share.state === 2;
  share.isRunning = share.state === 1;
  share.isStopped = share.state === 0;
  share.meta.uptimeReadable = prettyms(share.meta.uptimeMs);

  return share;
}


module.exports = ShareList;
