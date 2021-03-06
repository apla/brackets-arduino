// we can pass those variables along with window object

var serialMonitorPath = decodeURIComponent (location.pathname).replace ('index.html', "");
var extensionPath     = serialMonitorPath.replace ("serial-monitor/", "");

if (navigator.platform === "Win32") {
	extensionPath = extensionPath.replace (/^\/([A-Z])\:/, "$1:")
}

require.config({
	baseUrl: bracketsWwwPath,
	paths: {
		"utils/EventDispatcher":      serialMonitorPath + "utils/EventDispatcher",
		"utils/NodeConnection":       serialMonitorPath + "utils/NodeConnection",
		"utils/NodeDomain":           serialMonitorPath + "utils/NodeDomain",
		"widgets/bootstrap-dropdown": serialMonitorPath + "widgets/bootstrap-dropdown"
	}
});

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
 * maxerr: 50, browser: true */
/*global $, define, brackets */

uiHandler ();

brackets.getModule = require;

var moduleId = "me.apla.brackets-cuwire.console";
var cuwireDomain;

requirejs (
	['utils/EventDispatcher', 'utils/NodeConnection', 'utils/NodeDomain', 'widgets/bootstrap-dropdown'],
	function   (EventDispatcher, NodeConnection, NodeDomain) {
		"use strict";


		cuwireDomain = new NodeDomain ("cuwire", extensionPath + "node/cuwireDomain.js");

		var portEnumSub = false;

		var currentPort;

		function setPort (port) {

			var titleButton = document.querySelector ('#cuwire-panel button.cuwire-port');
			if (port) {
				currentPort = port;
			}

			if (currentPort) {
				titleButton.textContent = currentPort.name.replace (/^\/dev\/(cu\.)?/, "");
			} else {
				titleButton.textContent = "Port";
			}
		}

		// TODO: fill baudrate list
		var baudratesLi = [].slice.apply (document.querySelectorAll ('#cuwire-panel ul.cuwire-baudrate li'));
		baudratesLi.forEach (function (li) {
			li.addEventListener ('click', function (evt) {
				setBaudRate (parseInt (evt.target.textContent));
			}, false);
		});

		var currentBaudrate;
		if (localStorage.cuwireBaudrate) {
			currentBaudrate = localStorage.cuwireBaudrate;
		}

		function setBaudRate (baudrate) {
//			console.log (baudrate);
			var titleButton = document.querySelector ('#cuwire-panel button.cuwire-baudrate');

			if (baudrate) {
				titleButton.textContent = baudrate;
				currentBaudrate = baudrate;
				localStorage.cuwireBaudrate = currentBaudrate;
			} else if (currentBaudrate) {
				titleButton.textContent = currentBaudrate;
			} else {
				titleButton.textContent = "Baudrate";
			}
		}

		setBaudRate ();

		var boardUSBMatch;
		if (localStorage.boardUSBMatch) {
			boardUSBMatch = JSON.parse (localStorage.boardUSBMatch);
		}

		function boardNameForPort (port) {
			var usbPair = [port.vendorId, port.productId].join (':');

			if (boardUSBMatch) {
				var boardInfo = boardUSBMatch[usbPair];
				if (boardInfo) {
					port.boardInfo = boardInfo;
					return '<b>'+boardInfo.board.name + '</b> ('+port.name+')';
				}
			}
			return port.name;
		}

		var connectButton = document.querySelector ('button.cuwire-com-connect');

		function enumerateSerialPorts () {
			// TODO: show spinner indicator

			var self = this;

			var cuwirePortDD = $('#cuwire-panel ul.cuwire-port');
			if (!portEnumSub) {
				// can't find the working API for this
				var buttonDD = cuwirePortDD.prev("*[data-toggle=\"dropdown\"]");
				buttonDD.on ('click', function () {
					if (!buttonDD.parent ().hasClass ('open')) {
						enumerateSerialPorts ();
					}
				});
				//			cuwirePortDD.prev().on ('show.bs.dropdown', function () {
				//				console.log (123);
				//			});
				portEnumSub = true;
			}

			$('<li><a href="#">Updating</a></li>').appendTo(cuwirePortDD);

			cuwireDomain.exec("enumerateSerialPorts")
			.done(function (ports) {
				// TODO: get last used port from preference manager
				// TODO: show warning indicator
				// user must select port prior to launch
				console.log(
					"[brackets-cuwire-node] Available ports:",
					ports.map (function (port) {return port})
				);
				cuwirePortDD.empty ();
				// tr = $('<tr />').appendTo('#cuwire-panel tbody');

				ports.forEach (function (port) {
					$('<li><a href="#">'
					  + boardNameForPort (port)
					  + (port.manufacturer ? ' - <i>'+port.manufacturer+'</i>' : "")
					  +"</a></li>")
					.on ('click', setPort.bind (self, port))
					.appendTo(cuwirePortDD);
					if (port.name === window.location.qs.serialPort) {
						setPort (port);
					}
					if (port.connected) {
						connectButton.textContent = "Disconnect";
					}
				});

//				console.log (port.name, window.location.qs.serialPort);


				//		$('<td />').text(err.message).appendTo(tr);
				//		$('<td />').text(err.filename).appendTo(tr);
				setPort ();
			}).fail(function (err) {
				// TODO: show error indicator
				console.error("[brackets-cuwire-node] failed to run cuwire.enumerateSerialPorts, error:", err);
			});

		}

		enumerateSerialPorts();

		var preNode = document.querySelector ('.log-wrapper pre');

		cuwireDomain.on ('serialMessage', function (event, message) {

			var lastChild = preNode.lastChild;
			if (!lastChild || lastChild.nodeType !== 3) {
				preNode.appendChild (document.createTextNode (message));
			} else {
				lastChild.textContent += message;
			}
			setTimeout (function () {
				preNode.parentElement.scrollTop = preNode.parentElement.scrollHeight;
			}, 0);

		});

		function appendMark (text, cls, haveDate) {
			var div = document.createElement ('div');
			div.classList.add ('mark');
			if (cls) div.classList.add (cls);
			div.textContent = [
				(haveDate === undefined || haveDate) ? new Date ().toLocaleString() + ' ' : null,
				text
			].join ('');
			preNode.appendChild (div);
		}

		cuwireDomain.on ('serialPortClose', function (event, message) {
			connectButton.textContent = "Connect";
			appendMark ('serial port is closed');
		});

		var clearButton = document.querySelector ('button.cuwire-log-clear');
		clearButton.addEventListener ('click', function () {
			preNode.innerHTML = '';
		}, false)


		var markButton = document.querySelector ('button.cuwire-log-mark');
		markButton.addEventListener ('click', function () {
			appendMark ();
		}, false)

		// don't use button title, move to state machine
		connectButton.addEventListener ('click', function () {
			if (connectButton.textContent === "Disconnect") {
				cuwireDomain.exec ("closeSerialPort", [
					currentPort
				]).done (function (ports) {
					connectButton.textContent = "Connect";
				}).fail(function (err) {
					// TODO: show error indicator
					console.error("[brackets-cuwire-node] failed to run cuwire.openSerialPort, error:", err);
				});
				return;
			}
			cuwireDomain.exec ("openSerialPort", [
				currentPort,
				currentBaudrate
			]).done (function (ports) {
				connectButton.textContent = "Disconnect";
				appendMark ('serial port is opened');
			}).fail (function (err) {
				// TODO: show error indicator
				console.error("[brackets-cuwire-node] failed to run cuwire.openSerialPort, error:", err);
			});

		}, false);

		var sendButton = document.querySelector ('button.cuwire-com-send');
		// little dirty
		var messageInput = sendButton.previousElementSibling;

		sendButton.addEventListener ('click', function () {
			sendMessageSerial (currentPort, messageInput.value);
			messageInput.select ();
			appendMark (messageInput.value, "tx", false);
		}, false);


		messageInput.addEventListener ('keyup', function (evt) {
			if (evt.keyCode === 13) {
				sendMessageSerial (currentPort, messageInput.value);
				messageInput.select ();
				appendMark (messageInput.value, "tx", false);
				return false;
			}
		}, false);

});

function sendMessageSerial (port, commandText) {

	cuwireDomain.exec ("sendMessageSerial", [
		port,
		commandText
	]).done (function () {

	}).fail (function (err) {
		// TODO: show error indicator
		console.error("[brackets-cuwire-node] failed to run cuwire.sendMessageSerial, error:", err);
	});

}

function getAbsoluteHeight(el) {
	// Get the DOM Node if you pass in a string
	el = (typeof el === 'string') ? document.querySelector(el) : el;

	var styles = window.getComputedStyle(el);
	var margin = parseFloat(styles['marginTop']) +
		parseFloat(styles['marginBottom']);

	return Math.ceil(el.offsetHeight + margin);
}

var resizeTimeoutId;

function resizeUI () {
	var occupiedHeight = getAbsoluteHeight ('h3') + getAbsoluteHeight ('#cuwire-console');
	var logWrapper = document.querySelector ('.log-wrapper');
	// 2 is border height
	logWrapper.style.height = (window.innerHeight - occupiedHeight - 2) + "px";
}

function onWindowResize(e) {
	clearTimeout (resizeTimeoutId);
	resizeTimeoutId = window.setTimeout (resizeUI, 10);
}

function uiHandler () {
	var controlsHeight;
	window.addEventListener ('resize', onWindowResize);
	resizeUI();
}
