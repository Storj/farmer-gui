'use strict';

module.exports = {
  data: function() {
    return window.Store.newShare;
  },
  components: {
    'ext-a' : require('../components/external-anchor')
  },
  created: function() {
    this.actions.reset();
    //Pre-fill their first payment address if they already have a share
    if(window.Store.shareList.shares.length > 0) {
      this.$set(this.config, 'paymentAddress', window.Store.shareList.shares[0].config.paymentAddress);
    }
  },
  mixins: [{
    methods: {
      checkEthereumAddress: function(address) {
        const utils = require('storjshare-daemon').utils;
        return utils.isValidEthereumAddress(address);

      }
    }
  }],
  template: `
<section>
  <div class="container">
    <div class="row wizard-nav">
      <div class="col-6">
        <span v-if="!$route.query.edit"><router-link :to="{path: '/share-wizard'}"><small>&lt; Go Back</small></router-link></span>
        <span v-if="$route.query.edit"><router-link :to="{path: '/overview'}"><small>&lt; Go Back</small></router-link></span>
      </div>
      <div class="col-6 text-right">
        <small>Step 1 of 3</small>
      </div>
    </div>
    <div class="row">
      <div class="col-12">
        <img src="imgs/logo.svg" alt="Storj Share" class="logo">
      </div>
    </div>
    <div class="row text-center">
      <div class="col-12">
        <h2>Step 1 - Payout Address</h2>
        <p>Storj uses an Ethereum ERC20 token. Please provide your Ethereum address from a supported wallet to receive payments.</p>
        <p><ext-a href="https://parity.io/">Parity</ext-a> &middot; <ext-a href="https://github.com/ethereum/mist/releases">Mist</ext-a> &middot; <ext-a href="https://www.myetherwallet.com/">MyEtherWallet</ext-a></p>
      </div>
    </div>
    <div class="row text-center mb-4 mt-3">
      <div class="col-12">
        <input v-model="config.paymentAddress" type="text" class="address" placeholder="0xETHEREUM_ADDRESS">
        <router-link :to="{path: '/share-wizard/wizard2'}" class="btn" :disabled="!checkEthereumAddress(config.paymentAddress)">Next</router-link>
      </div>
    </div>
    <div class="row text-center">
      <div class="col-12">
        <small><ext-a href="https://storj.io/share.html#faq-1-3">How to create a wallet?</ext-a> &middot; <ext-a href="https://storj.io/share.html#faq-1-4">Where do I find the address?</ext-a></small>
      </div>
    </div>
  </div>
</section>
  `
};
