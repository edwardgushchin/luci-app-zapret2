'use strict';
'require view';
'require rpc';
'require fs';
'require poll';
'require ui';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name', 'verbose' ],
	expect: { '': {} }
});

var callInitList = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: [ 'name' ],
	expect: { '': {} }
});

var callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

function safeExec(cmd, args) {
	return fs.exec(cmd, args || []).catch(function(err) {
		return {
			code: -1,
			stdout: '',
			stderr: err ? (err.message || String(err)) : 'Unknown exec error'
		};
	});
}

function trim(s) {
	return (s || '').trim();
}

function serviceStateText(enabled, info) {
	if (!enabled && !info.running)
		return _('Disabled');
	if (info.running)
		return _('Running');
	return enabled ? _('Stopped') : _('Disabled');
}

function serviceInfo(serviceData) {
	var svc = serviceData && serviceData.zapret2 ? serviceData.zapret2 : null;
	var instances = svc && svc.instances ? Object.keys(svc.instances).map(function(k) { return svc.instances[k]; }) : [];
	var running = instances.filter(function(inst) { return !!inst.running; });
	var first = running[0] || instances[0] || null;

	return {
		count: instances.length,
		running: running.length > 0,
		pids: running.map(function(inst) { return inst.pid; }).filter(function(pid) { return pid != null; }),
		command: first && Array.isArray(first.command) ? first.command.join(' ') : '',
		pidfile: first && first.pidfile ? first.pidfile : '',
		termTimeout: first && first.term_timeout != null ? String(first.term_timeout) : ''
	};
}

return view.extend({
	load: function() {
		return this.fetchData();
	},

	fetchData: function() {
		return Promise.all([
			callInitList('zapret2'),
			callServiceList('zapret2', 1),
			fs.read('/opt/zapret2/config').catch(function() { return ''; }),
			safeExec('/etc/init.d/zapret2', [ 'list_table' ]),
			safeExec('/opt/zapret2/nfq2/nfqws2', [ '--version' ])
		]);
	},

	handleServiceAction: function(action, ev) {
		var self = this;
		if (ev && ev.currentTarget)
			ev.currentTarget.blur();

		return callInitAction('zapret2', action).then(function(success) {
			if (!success)
				throw new Error(_('Command failed'));

			ui.addNotification(null, E('p', _('Action executed: %s').format(action)));
			return self.updateStatus();
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Unable to execute action "%s": %s').format(action, err.message || err)));
		});
	},

	updateStatus: function() {
		var self = this;
		return this.fetchData().then(function(data) {
			self.applyData(data);
		});
	},

	applyData: function(data) {
		var initList = data[0] || {};
		var svcList = data[1] || {};
		var configText = data[2] || '';
		var listTable = data[3] || { code: -1, stdout: '', stderr: '' };
		var versionRes = data[4] || { code: -1, stdout: '', stderr: '' };

		var enabled = !!(initList.zapret2 && initList.zapret2.enabled);
		var info = serviceInfo(svcList);
		var statusText = serviceStateText(enabled, info);
		var versionText = trim(versionRes.stdout || versionRes.stderr || _('Unknown'));
		var rulesText = trim(listTable.stdout || listTable.stderr || _('No queue rules output'));

		this.statusValue.textContent = statusText;
		this.autorunValue.textContent = enabled ? _('Enabled') : _('Disabled');
		this.instancesValue.textContent = String(info.count);
		this.pidValue.textContent = info.pids.length ? info.pids.join(', ') : '—';
		this.versionValue.textContent = versionText;
		this.commandArea.value = info.command || '';
		this.rulesArea.value = rulesText;
		this.configArea.value = trim(configText);

		this.btnEnable.disabled = enabled;
		this.btnDisable.disabled = !enabled;
		this.btnStart.disabled = info.running;
		this.btnRestart.disabled = !info.running;
		this.btnStop.disabled = !info.running;
	},

	render: function(data) {
		var self = this;

		this.statusValue = E('strong', { 'style': 'font-size:1.05rem' }, _('Loading...'));
		this.autorunValue = E('span', _('Loading...'));
		this.instancesValue = E('span', _('Loading...'));
		this.pidValue = E('span', _('Loading...'));
		this.versionValue = E('span', _('Loading...'));
		this.commandArea = E('textarea', {
			'class': 'cbi-input-textarea',
			'readonly': 'readonly',
			'wrap': 'off',
			'style': 'width:100%; min-height:180px; font-family:monospace;'
		});
		this.rulesArea = E('textarea', {
			'class': 'cbi-input-textarea',
			'readonly': 'readonly',
			'wrap': 'off',
			'style': 'width:100%; min-height:260px; font-family:monospace;'
		});
		this.configArea = E('textarea', {
			'class': 'cbi-input-textarea',
			'readonly': 'readonly',
			'wrap': 'off',
			'style': 'width:100%; min-height:320px; font-family:monospace;'
		});

		this.btnEnable = E('button', {
			'class': 'btn cbi-button-save important',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('enable', ev); })
		}, _('Enable'));
		this.btnDisable = E('button', {
			'class': 'btn cbi-button-negative important',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('disable', ev); })
		}, _('Disable'));
		this.btnStart = E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('start', ev); })
		}, _('Start'));
		this.btnRestart = E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('restart', ev); })
		}, _('Restart'));
		this.btnStop = E('button', {
			'class': 'btn cbi-button-negative',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('stop', ev); })
		}, _('Stop'));
		this.btnRefresh = E('button', {
			'class': 'btn',
			'click': ui.createHandlerFn(this, function() { return self.updateStatus(); })
		}, _('Refresh'));

		poll.add(function() {
			return self.updateStatus();
		}, 5);

		var page = E('div', {}, [
			E('h2', _('Zapret2')),
			E('div', { 'class': 'cbi-section-descr' }, _('Minimal LuCI panel for the manually installed zapret2 on Flint 2.')),

			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-node' }, [
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left', 'style': 'width:30%' }, _('Service state')), E('td', { 'class': 'td left' }, [ this.statusValue ]) ]),
						E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Autorun')), E('td', { 'class': 'td left' }, [ this.autorunValue ]) ]),
						E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Running instances')), E('td', { 'class': 'td left' }, [ this.instancesValue ]) ]),
						E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('PIDs')), E('td', { 'class': 'td left' }, [ this.pidValue ]) ]),
						E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('nfqws2 version')), E('td', { 'class': 'td left' }, [ this.versionValue ]) ])
					])
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Service control')),
				E('div', { 'class': 'cbi-section-node', 'style': 'display:flex; gap:8px; flex-wrap:wrap;' }, [
					this.btnEnable,
					this.btnDisable,
					this.btnStart,
					this.btnRestart,
					this.btnStop,
					this.btnRefresh
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Active nfqws2 command line')),
				E('div', { 'class': 'cbi-section-node' }, [ this.commandArea ])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Current queue rules / list_table')),
				E('div', { 'class': 'cbi-section-node' }, [ this.rulesArea ])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Current /opt/zapret2/config')),
				E('div', { 'class': 'cbi-section-node' }, [ this.configArea ])
			])
		]);

		this.applyData(data);
		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
