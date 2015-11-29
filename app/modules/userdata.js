/* global $ */
/* global Ladda */
/* global requirejs */

'use strict';

var os = require('os');
var fs = require('fs');
var request = require('request');
var remote = require('remote');
var app = remote.require('app');
var dialog = remote.require('dialog');
var ipc = require("electron-safe-ipc/guest");
var diskspace = require('diskspace');
var process;

var rootDrive = os.platform() !== 'win32' ? '/' : 'C';

exports.tabs = [];
var selectedTab = 0;
var tabCount = 0;
var laddaButtons = [];

exports.init = function() {

	// load data from config file
	try {
		read(true);
	} catch (error) {
		console.log(error.toString());
	}

	// HAX = temporary workaroud while automatic setup isn't working on OSX
	if(os.platform() !== 'win32') {
		exports.dataservClient = 'dataserv-client';
	}

	process = requirejs('./modules/process');

	$('#btnAddTab').on('click', function(e){
		var currentTab = ++tabCount;
		createTab(currentTab);
		showTab(currentTab);
		e.preventDefault();
	});
};

exports.save = function(bQuerySJCX) {
	var index = selectedTab - 1;
	var tabData = exports.tabs[index];

	ensureDataServClient(tabData, saveTabData);

	process.saveConfig(tabData.dataservClient, tabData.payoutAddress);
	validate(bQuerySJCX, tabData);
};

var read = function(bQuerySJCX) {
	// load data from config file
	 try {
		//test to see if settings exist
		var path = app.getPath('userData') + '/' + window.env.configFileName;
		console.log('Reading settings from \'' + path + '\'');
		try{
			fs.openSync(path, 'r+'); //throws error if file doesn't exist
		} catch(ex) {
			fs.writeFileSync(path, '{}');
		}
		var data = fs.readFileSync(path); //file exists, get the contents

		var userData = JSON.parse(data); //turn to js object

		// If there is dataserv client installed set it
		if (userData.dataservClient) {
			exports.dataservClient = userData.dataservClient;
		}

		// Clear the tabs
		$('.driveTab').remove();
		$('.tab-pane').remove();

		// If there isn't any saved user data or first run create the first tab only
		if (!userData || !userData.tabs || userData.tabs.length <= 0) {
			var currentTab = ++tabCount;
			createTab(currentTab);
			showTab(currentTab);
		}
		else {
			tabCount = userData.tabs.length;
			exports.tabs = userData.tabs;

			for (var i = 0; i < tabCount; i++) {
				if ($("#tabPage" + (i+1)).length) {
					continue;
				}
				var tabData = userData.tabs[i];

				if (!tabData) continue;

				var currentTab = i + 1;
				createTab(currentTab);
				showTab(currentTab);

				if(hasValidPayoutAddress(tabData.payoutAddress)) {
					setValue(currentTab, '.address', tabData.payoutAddress);
				}
				if(hasValidDataservDirectory(tabData.dataservDirectory)) {
					setValue(currentTab, '.directory', tabData.dataservDirectory);
				}
				if(hasValidDataservSize(tabData.dataservSize)) {
					setValue(currentTab, '.size', tabData.dataservSize);
					setValue(currentTab, '.size-unit', tabData.dataservSizeUnit);
				} else {
					tabData.dataservSizeUnit = 'GB';
				}

				validate(bQuerySJCX, tabData);
			}
			showTab(1);
		}

	} catch (error) {
		console.log(error.toString());
	}

	$('.nav-tabs')
	.off('shown.bs.tab', 'a[data-toggle="tab"]')
	.on('shown.bs.tab', 'a[data-toggle="tab"]', function (e) {
		selectedTab = parseInt($(this).data('tabid'));
	});

	$('.tab-content').on('click', '.browse', function (e) {
		dialog.showOpenDialog({
			title: 'Please select directory',
			defaultPath: app.getPath('userDesktop'),
			properties: [ 'openDirectory' ]
			}, function(path) {
				if(path !== undefined && path !== "") {
					var currentTabId = '#tabPage' + (selectedTab);
					$(currentTabId + ' .directory').val(path[0]);

					ensureTab(selectedTab);
					exports.tabs[selectedTab - 1].dataservDirectory = path[0];
					exports.save();
				}
			}
		);
	});

	// Save settings when user changes the values
	$(".tab-content").on('change', '.address', function() {
		ensureTab(selectedTab);
		exports.tabs[selectedTab - 1].payoutAddress = getValue(selectedTab, '.address');
		exports.save(true);
	});
	$(".tab-content").on('change', '.size-unit', function() {
		ensureTab(selectedTab);
		exports.tabs[selectedTab - 1].dataservSizeUnit = getValue(selectedTab, '.size-unit');
		exports.save();
	});

	$(".tab-content").on('click', '.start', function (e) {
		var tabData = exports.tabs[selectedTab - 1];
		if(hasValidSettings(tabData)) {
			if(process.currentProcesses && process.currentProcesses[tabData.dataservClient]) {
				process.terminateProcess(tabData.dataservClient);
			} else {
				process.farm(tabData.dataservClient, tabData.dataservDirectory, tabData.dataservSize, tabData.dataservSizeUnit);
			}
		}
		realizeUI();
	});
};

var validate = function(bQuerySJCX, tabData) {
	if(bQuerySJCX) {
		querySJCX(tabData);
	}
	if(hasValidDataservDirectory() && hasValidDataservSize()) {
		if(os.platform() === 'win32') {
			rootDrive = dataservDirectory.toString().charAt(0);
		}
		queryFreeSpace(tabData);
	}

	var finalSelector = getFinalSelector('.start');

	$(finalSelector).prop('disabled', !hasValidSettings(tabData));
};

exports.hasValidDataservClient = function() {
	return exports.dataservClient !== undefined && exports.dataservClient !== '';
};

var hasValidPayoutAddress = function(payoutAddress) {
	return payoutAddress !== undefined && payoutAddress !== '';
};

var hasValidDataservDirectory = function(dataservDirectory) {
	return dataservDirectory !== undefined && dataservDirectory !== '';
};

var hasValidDataservSize = function(dataservSize) {
	return dataservSize !== undefined && dataservSize !== '';
};

var hasValidSettings = function(tabData) {
	return (exports.hasValidDataservClient() &&
			hasValidPayoutAddress(tabData.payoutAddress));
};

var querySJCX = function(onComplete, tabData) {
	if(hasValidPayoutAddress()) {
		request("http://xcp.blockscan.com/api2?module=address&action=balance&btc_address=" + tabData.payoutAddress + "&asset=SJCX",
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var createNewAddressHTML = '<a href="https://counterwallet.io/" class="js-external-link">Create New Address</a>';
				var finalSelector = getFinalSelector('.amount');
				var amountEl = $(finalSelector);
				if(!body || body === "") {
					amountEl.html(createNewAddressHTML);
					return;
				}
				var json = JSON.parse(body);
				if(json.status !== "error") {
					amountEl.html('<p>Balance: ' + json.data[0].balance + ' SJCX</p>');
				} else if(json.message.search("no available SJCX balance") !== -1) {
					amountEl.html('<p>Balance: 0 SJCX</p>');
				} else {
					amountEl.html(createNewAddressHTML);
				}
			} else {
				amountEl.html(createNewAddressHTML);
				console.log(error.toString());
			}
		});
	}
};


var realizeUI = function() {
	var tabData = exports.tabs[selectedTab - 1];
	var isDisabled = process.currentProcesses[tabData.dataservClient] !== null;

	$(getFinalSelector('.main')).toggleClass('disabled', isDisabled );
	$(getFinalSelector('.address')).prop('disabled', isDisabled);
	$(getFinalSelector('.size-unit')).prop('disabled', isDisabled);

	if(isDisabled) {
		laddaButtons[selectedTab].start();
		$(getFinalSelector('.start')).prop('disabled', false); // l.start causes the bootstrap button to be unclickable, this ensures we can still click the button
		$(getFinalSelector('.start')).css({ 'background-color': '#FFA500', 'border-color': '#FFA500' }); // orange
		$(getFinalSelector('.start-label')).text('RUNNING, CLICK TO ABORT');
	} else {
		laddaButtons[selectedTab].stop();
		$(getFinalSelector('.start')).css({ 'background-color': '#88C425', 'border-color': '#88C425' }); // green
		$(getFinalSelector('.start-label')).text('START');
	}
};

var ensureTab = function(index){
	if (!exports.tabs[index - 1]) {
		exports.tabs[index - 1] = {dataservSizeUnit: 'GB'};
	}
};

var getValue = function(index, selector){
	var finalSelector = getFinalSelector(selector);
	return $(finalSelector).val();
};

var setValue = function(index, selector, value){
	var finalSelector = getFinalSelector(selector);
	return $(finalSelector).val(value);
};

var getFinalSelector = function (selector) {
    var currentTabId = "#tabPage" + selectedTab;
    var finalSelector = currentTabId + " " + selector;
    return finalSelector;
};

var randomNumber = function() {
	// Returns random 4-digit integer
    return Math.floor(Math.random() * (9999 - 1000 + 1) + 1000);
}
