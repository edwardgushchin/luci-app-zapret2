'use strict';
'require view';
'require rpc';
'require fs';
'require poll';
'require ui';

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
		.z2-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}
		.z2-section-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			flex-wrap: wrap;
			margin-bottom: 10px;
		}
		.z2-section-title {
			font-size: 15px;
			font-weight: 700;
		}
		.z2-section-tools {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		}
		.z2-textarea {
			width: 100%;
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
		ui.addNotification(null, E('p', _('Нечего копировать.')));
		return Promise.resolve();
	}

	if (navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(value).then(function() {
			ui.addNotification(null, E('p', _('Скопировано: %s').format(label)));
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Не удалось скопировать %s: %s').format(label, err.message || err)));
		});
	}

	try {
		var temp = E('textarea', { 'style': 'position:absolute;left:-9999px;top:-9999px;' }, value);
		document.body.appendChild(temp);
		temp.focus();
		temp.select();
		document.execCommand('copy');
		temp.remove();
		ui.addNotification(null, E('p', _('Скопировано: %s').format(label)));
	} catch (err2) {
		ui.addNotification(null, E('p', _('Не удалось скопировать %s: %s').format(label, err2.message || err2)));
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
		return { label: _('Работает'), className: 'z2-running' };
	}
	if (!enabled) {
		return { label: _('Выключен'), className: 'z2-disabled' };
	}
	return { label: _('Остановлен'), className: 'z2-stopped' };
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
				}, _('Копировать'))
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
				throw new Error(_('Command failed'));

			ui.addNotification(null, E('p', _('Команда выполнена: %s').format(action)));
			return self.updateStatus();
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Не удалось выполнить действие "%s": %s').format(action, err.message || err)));
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
		var versionText = trimText(versionRes.stdout || versionRes.stderr || _('Неизвестно'));
		var rulesText = trimText(listTable.stdout || listTable.stderr || _('Нет вывода queue rules'));

		this.statusBadge.textContent = state.label;
		this.statusBadge.className = 'z2-badge ' + state.className;
		this.autorunValue.textContent = enabled ? _('Включён') : _('Выключен');
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

		this.statusBadge = E('span', { 'class': 'z2-badge z2-stopped' }, _('Загрузка...'));
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
		}, _('Включить автозапуск'));
		this.btnDisable = E('button', {
			'class': 'btn cbi-button-negative important',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('disable', ev); })
		}, _('Выключить автозапуск'));
		this.btnStart = E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('start', ev); })
		}, _('Запустить'));
		this.btnRestart = E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('restart', ev); })
		}, _('Перезапустить'));
		this.btnStop = E('button', {
			'class': 'btn cbi-button-negative',
			'click': ui.createHandlerFn(this, function(ev) { return self.handleServiceAction('stop', ev); })
		}, _('Остановить'));
		this.btnRefresh = E('button', {
			'class': 'btn',
			'click': ui.createHandlerFn(this, function() { return self.updateStatus(); })
		}, _('Обновить'));

		poll.add(function() {
			return self.updateStatus();
		}, 5);

		var page = E('div', { 'class': 'z2-page' }, [
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'class': 'z2-status-strip' }, [
						E('div', {}, [
							E('h2', { 'style': 'margin:0 0 6px 0;' }, _('Zapret2')),
							E('div', { 'class': 'z2-muted' }, _('Мини-панель для вручную установленного zapret2 на Flint 2.'))
						]),
						this.statusBadge
					])
				])
			]),

			E('div', { 'class': 'z2-grid' }, [
				makeMetaCard(_('Автозапуск'), this.autorunValue),
				makeMetaCard(_('Инстансы'), this.instancesValue),
				makeMetaCard(_('PID'), this.pidsValue),
				makeMetaCard(_('Версия nfqws2'), this.versionValue),
				makeMetaCard(_('Профили в команде'), this.profileCountValue)
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'z2-section-header' }, [
					E('div', { 'class': 'z2-section-title' }, _('Управление сервисом')),
					E('div', { 'class': 'z2-section-tools' }, [ this.btnRefresh ])
				]),
				E('div', { 'class': 'cbi-section-node z2-actions' }, [
					this.btnEnable,
					this.btnDisable,
					this.btnStart,
					this.btnRestart,
					this.btnStop
				]),
				E('div', { 'class': 'z2-note' }, _('Страница обновляется автоматически раз в 5 секунд.'))
			]),

			makeTextSection(_('Активная команда nfqws2'), _('Текущая живая командная строка процесса.'), this.commandArea, _('командная строка nfqws2'), this),
			makeTextSection(_('Текущие queue rules'), _('Вывод /etc/init.d/zapret2 list_table.'), this.rulesArea, _('queue rules'), this),
			makeTextSection(_('Текущий /opt/zapret2/config'), _('Основной runtime-конфиг zapret2 на роутере.'), this.configArea, _('config zapret2'), this)
		]);

		this.applyData(data);
		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
