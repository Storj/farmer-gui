'use strict';
const bytes = require('bytes');

module.exports = {
  data: function() {
    return {
      store: window.Store.newShare
    };
  },
  filters: require('../components/filters/metrics'),
  components: {
    'disk-allocator' : require('../components/disk-allocator')
  },
  created: function() {
    if(!this.store.storageAvailable) {
      this.store.errors.push(new Error('Invalid directory selected'));
    }
  },
  methods: {
    validAllocation: function() {
      return this.store.config.storageAllocation <= this.store.storageAvailable;
    }
  },
  template: `
<section>
  <div class="container">
    <div class="row wizard-nav">
      <div class="col-6">
        <router-link :to="{path: '/share-wizard/wizard2'}"><small>&lt; Go Back</small></router-link>
      </div>
      <div class="col-6 text-right">
        <small>Step 3 of 5</small>
      </div>
    </div>
    <div class="row">
      <div class="col">
        <img src="imgs/logo.svg" alt="Storj Share" class="logo">
      </div>
    </div>
    <div class="row text-center">
      <div class="col">
        <h2>Step 3 - Storage Sharing</h2>
        <p>Storj Share uses only the storage space you share. <br class="hidden-sm-down">The more storage you share, the more you can earn.</p>
      </div>
    </div>
    <div class="row justify-content-center">
      <div class="col col-md-10 col-lg-8 col-xl-6">
        <disk-allocator
          v-model="store.config.storageAllocation"
          v-bind:available="store.storageAvailable">
        </disk-allocator>
      </div>
    </div>
    <div class="row text-center justify-content-center">
      <div class="col col-md-10 col-lg-8 col-xl-6">
        <router-link :to="{path: '/share-wizard/wizard4'}" class="btn" v-bind:disabled="!validAllocation()">Next</router-link>
      </div>
    </div>
  </div>
</section>
  `
};
