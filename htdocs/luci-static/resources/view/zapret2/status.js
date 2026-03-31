'use strict';
'require view';
'require rpc';
'require fs';
'require poll';
'require ui';

function detectLocale() {
	var htmlLang = '';
	var luciLang = '';
	var browserLang = '';

	try {
		htmlLang = document && document.documentElement ? (document.documentElement.getAttribute('lang') || '') : '';
	} catch (e) {}

	try {
		luciLang = window.L && L.env ? (L.env.lang || L.env.i18nLanguage || '') : '';
	} catch (e2) {}

	try {
		browserLang = (navigator.language || (navigator.languages && navigator.languages[0]) || '');
	} catch (e3) {}

	return String(htmlLang || luciLang || browserLang || 'en').toLowerCase();
}

var CURRENT_LOCALE = detectLocale();
var USE_RUSSIAN = /^ru([_-]|$)/.test(CURRENT_LOCALE);

function tr(en, ru) {
	return USE_RUSSIAN ? ru : en;
}

if (!window.__zapret2PanelStylesInjected) {
	window.__zapret2PanelStylesInjected = true;
	document.head.append(E('style', { 'type': 'text/css' }, `
		.z2-page {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		.z2-muted {
			opacity: .82;
		}
		.z2-status-strip {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			flex-wrap: wrap;
		}
		.z2-badge {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 7px 12px;
			border-radius: 999px;
			font-weight: 700;
			font-size: 13px;
			line-height: 1;
			letter-spacing: .01em;
		}
		.z2-badge::before {
			content: '';
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: currentColor;
			opacity: .9;
		}
		.z2-running {
			background: rgba(46, 162, 86, .14);
			color: #2ea256;
		}
		.z2-stopped {
			background: rgba(138, 138, 138, .15);
			color: #9aa0a6;
		}
		.z2-disabled {
			background: rgba(117, 117, 117, .16);
			color: #8d96a0;
		}
		.z2-error {
			background: rgba(255, 78, 84, .14);
			color: #ff4e54;
		}
		.z2-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 12px;
		}
		.z2-card {
			border: 1px solid var(--border-color-medium, rgba(255,255,255,.08));
			border-radius: 14px;
			padding: 14px 16px;
			background: var(--app-body-bg, rgba(255,255,255,.02));
			box-shadow: 0 2px 12px rgba(0,0,0,.06);
		}
		.z2-card-label {
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: .06em;
			opacity: .72;
			margin-bottom: 8px;
		}
		.z2-card-value {
			font-size: 15px;
			font-weight: 600;
			word-break: break-word;
		}
		.z2-page .cbi-section {
			margin: 0 0 16px 0;
			padding: 16px 18px;
		}
		.z2-page .cbi-section:last-child {
			margin-bottom: 0;
		}
		.z2-page .cbi-section-node {
			padding: 0;
		}
		.z2-actions {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 10px;
			align-items: stretch;
			margin: 10px 0 12px 0;
		}
		.z2-page .cbi-section-node.z2-actions {
			padding: 4px 0;
		}
		.z2-actions .btn {
			display: inline-flex !important;
			align-items: center;
			justify-content: center;
			width: 100%;
			min-height: 42px;
			margin: 0 !important;
			padding: 10px 14px;
			border-radius: 10px;
			text-align: center;
			white-space: normal;
			line-height: 1.25;
		}
		.z2-section-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			flex-wrap: wrap;
			margin-bottom: 14px;
		}
		.z2-section-title {
			font-size: 15px;
			font-weight: 700;
			margin-bottom: 4px;
		}
		.z2-section-tools {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		}
		.z2-section-tools .btn {
			margin: 0 !important;
		}
		.z2-textarea {
			width: 100%;
			box-sizing: border-box;
			min-height: 220px;
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			font-size: 12px;
			line-height: 1.45;
			border-radius: 12px;
			padding: 12px 13px;
		}
		.z2-textarea.z2-compact {
			min-height: 180px;
		}
		.z2-note {
			font-size: 12px;
			opacity: .72;
			margin-top: 8px;
			line-height: 1.45;
		}
		.z2-section + .z2-section {
			margin-top: 4px;
		}
	`));
}

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

function trimText(value) {
	return (value || '').trim();
}

function prettifyCommand(command) {
	if (!command)
		return '';

	return command
		.replace(/\s+--new\b/g, '\n\n--new')
		.replace(/\s+(--[^\s]+)/g, '\n$1')
		.trim();
}

function copyText(text, label) {
	var value = trimText(text);
	if (!value) {
		ui.addNotification(null, E('p', tr('Nothing to copy.', 'Нечего копировать.')));
		return Promise.resolve();
	}

	if (navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(value).then(function() {
			ui.addNotification(null, E('p', tr('Copied: %s', 'Скопировано: %s').format(label)));
		}).catch(function(err) {
			ui.addNotification(null, E('p', tr('Failed to copy %s: %s', 'Не удалось скопировать %s: %s').format(label, err.message || err)));
		});
	}

	try {
		var temp = E('textarea', { 'style': 'position:absolute;left:-9999px;top:-9999px;' }, value);
		document.body.appendChild(temp);
		temp.focus();
		temp.select();
		document.execCommand('copy');
		temp.remove();
		ui.addNotification(null, E('p', tr('Copied: %s', 'Скопировано: %s').format(label)));
	} catch (err2) {
		ui.addNotification(null, E('p', tr('Failed to copy %s: %s', 'Не удалось скопировать %s: %s').format(label, err2.message || err2)));
	}

	return Promise.resolve();
}

function getServiceInfo(serviceData) {
	var svc = serviceData && serviceData.zapret2 ? serviceData.zapret2 : null;
	var instances = svc && svc.instances ? Object.keys(svc.instances).map(function(key) { return svc.instances[key]; }) : [];
	var running = instances.filter(function(instance) { return !!instance.running; });
	var first = running[0] || instances[0] || null;
	var command = first && Array.isArray(first.command) ? first.command.join(' ') : '';

	return {
		totalCount: instances.length,
		runningCount: running.length,
		running: running.length > 0,
		pids: running.map(function(instance) { return instance.pid; }).filter(function(pid) { return pid != null; }),
		command: command,
		formattedCommand: prettifyCommand(command),
		profileCount: command ? Math.max(1, (command.match(/--new\b/g) || []).length + 1) : 0
	};
}

function getStateInfo(enabled, serviceInfo) {
	if (serviceInfo.running) {
		return { label: tr('Running', 'Работает'), className: 'z2-running' };
	}
	if (!enabled) {
		return { label: tr('Disabled', 'Выключен'), className: 'z2-disabled' };
	}
	return { label: tr('Stopped', 'Остановлен'), className: 'z2-stopped' };
}

function makeMetaCard(label, valueNode) {
	return E('div', { 'class': 'z2-card' }, [
		E('div', { 'class': 'z2-card-label' }, label),
		E('div', { 'class': 'z2-card-value' }, [ valueNode ])
	]);
}

function makeTextSection(title, subtitle, textareaNode, copyLabel, self) {
	return E('div', { 'class': 'cbi-section' }, [
		E('div', { 'class': 'z2-section-header' }, [
			E('div', {}, [
				E('div', { 'class': 'z2-section-title' }, title),
				subtitle ? E('div', { 'class': 'z2-note' }, subtitle) : ''
			]),
			E('div', { 'class': 'z2-section-tools' }, [
				E('button', {
					'class': 'btn',
					'click': ui.createHandlerFn(self, function() {
						return copyText(textareaNode.value, copyLabel);
					})
				}, tr('Copy', 'Копировать'))
			])
		]),
		E('div', { 'class': 'cbi-section-node' }, [ textareaNode ])
	]);
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
				throw new Error('Command failed');

			ui.addNotification(null, E('p', tr('Action executed: %s', 'Команда выполнена: %s').format(action)));
			return self.updateStatus();
		}).catch(function(err) {
			ui.addNotification(null, E('p', tr('Unable to execute action "%s": %s', 'Не удалось выполнить действие "%s": %s').format(action, err.message || err)));
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
		var serviceList = data[1] || {};
		var configText = data[2] || '';
		var listTable = data[3] || { code: -1, stdout: '', stderr: '' };
		var versionRes = data[4] || { code: -1, stdout: '', stderr: '' };

		var enabled = !!(initList.zapret2 && initList.zapret2.enabled);
		var info = getServiceInfo(serviceList);
		var state = getStateInfo(enabled, info);
		var versionText = trimText(versionRes.stdout || versionRes.stderr || tr('Unknown', 'Неизвестно'));
		var rulesText = trimText(listTable.stdout || listTable.stderr || tr('No queue rules output', 'Нет вывода queue rules'));

		this.statusBadge.textContent = state.label;
		this.statusBadge.className = 'z2-badge ' + state.className;
		this.autorunValue.textContent = enabled ? tr('Enabled', 'Включён') : tr('Disabled', 'Выключен');
		this.instancesValue.textContent = info.totalCount ? String(info.runningCount) + ' / ' + String(info.totalCount) : '0';
		this.pidsValue.textContent = info.pids.length ? info.pids.join(', ') : '—';
		this.versionValue.textContent = versionText;
		this.profileCountValue.textContent = info.profileCount ? String(info.profileCount) : '—';
		this.commandArea.value = info.formattedCommand || '';
		this.rulesArea.value = rulesText;
		this.configArea.value = trimText(configText);

		this.btnEnable.disabled = enabled;
		this.btnDisable.disabled = !enabled;
		this.btnStart.disabled = info.running;
		this.btnRestart.disabled = !info.running;
		this.btnStop.disabled = !info.running;
	},

	render: function(data) {
		var self = this;

		this.statusBadge = E('span', { 'class': 'z2-badge z2-stopped' }, tr('Loading...', 'Загрузка...'));
		this.autorunValue = E('span', '—');
		this.instancesValue = E('span', '—');
		this.pidsValue = E('span', '—');
		this.versionValue = E('span', '—');
		this.profileCountValue = E('span', '—');

		this.commandArea = E('textarea', {
			'class': 'cbi-input-textarea z2-textarea z2-compact',
			'readonly': 'readonly',
			'wrap': 'off'
		});
		this.rulesArea = E('textarea', {
			'class': 'cbi-input-textarea z2-textarea',
			'readonly': 'readonly',
			'wrap': 'off'
		});
		this.configArea = E('textarea', {
			'class': 'cbi-input-textarea z2-textarea',
			'readonly': 'readonly',
			'wrap': 'off'
		});

		this.btnEnable = E('button', {
			'class': 'btn cbi-button-save important',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('enable', ev); })
		}, tr('Enable autorun', 'Включить автозапуск'));
		this.btnDisable = E('button', {
			'class': 'btn cbi-button-negative important',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('disable', ev); })
		}, tr('Disable autorun', 'Выключить автозапуск'));
		this.btnStart = E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('start', ev); })
		}, tr('Start', 'Запустить'));
		this.btnRestart = E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('restart', ev); })
		}, tr('Restart', 'Перезапустить'));
		this.btnStop = E('button', {
			'class': 'btn cbi-button-negative',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('stop', ev); })
		}, tr('Stop', 'Остановить'));
		this.btnRefresh = E('button', {
			'class': 'btn',
			'click': ui.createHandlerFn(this, function() { return self.updateStatus(); })
		}, tr('Refresh', 'Обновить'));

		poll.add(function() {
			return self.updateStatus();
		}, 5);

		var page = E('div', { 'class': 'z2-page' }, [
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'class': 'z2-status-strip' }, [
						E('div', {}, [
							E('h2', { 'style': 'margin:0 0 6px 0;' }, 'Zapret2'),
							E('div', { 'class': 'z2-muted' }, tr(
								'Minimal panel for a manually installed zapret2 on Flint 2.',
								'Мини-панель для вручную установленного zapret2 на Flint 2.'
							))
						]),
						this.statusBadge
					])
				])
			]),

			E('div', { 'class': 'z2-grid' }, [
				makeMetaCard(tr('Autorun', 'Автозапуск'), this.autorunValue),
				makeMetaCard(tr('Instances', 'Инстансы'), this.instancesValue),
				makeMetaCard('PID', this.pidsValue),
				makeMetaCard(tr('nfqws2 version', 'Версия nfqws2'), this.versionValue),
				makeMetaCard(tr('Profiles in command', 'Профили в команде'), this.profileCountValue)
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'z2-section-header' }, [
					E('div', { 'class': 'z2-section-title' }, tr('Service control', 'Управление сервисом')),
					E('div', { 'class': 'z2-section-tools' }, [ this.btnRefresh ])
				]),
				E('div', { 'class': 'cbi-section-node z2-actions' }, [
					this.btnEnable,
					this.btnDisable,
					this.btnStart,
					this.btnRestart,
					this.btnStop
				]),
				E('div', { 'class': 'z2-note' }, tr(
					'The page refreshes automatically every 5 seconds.',
					'Страница обновляется автоматически раз в 5 секунд.'
				))
			]),

			makeTextSection(
				tr('Active nfqws2 command', 'Активная команда nfqws2'),
				tr('Current live command line of the running process.', 'Текущая живая командная строка процесса.'),
				this.commandArea,
				tr('nfqws2 command line', 'командная строка nfqws2'),
				this
			),
			makeTextSection(
				tr('Current queue rules', 'Текущие queue rules'),
				tr('Output of /etc/init.d/zapret2 list_table.', 'Вывод /etc/init.d/zapret2 list_table.'),
				this.rulesArea,
				tr('queue rules', 'queue rules'),
				this
			),
			makeTextSection(
				tr('Current /opt/zapret2/config', 'Текущий /opt/zapret2/config'),
				tr('Primary runtime configuration of zapret2 on the router.', 'Основной runtime-конфиг zapret2 на роутере.'),
				this.configArea,
				tr('zapret2 config', 'config zapret2'),
				this
			)
		]);

		this.applyData(data);
		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
