const TCP = require('../../tcp');
let debug;
let log;

/**
 * Companion instance for Da-Lite SCB.
 * @author Miguel Santana <santana1053@gmail.com>
 */
class instance extends require('../../instance_skel') {
	constructor(system, id, config) {
		super(system, id, config);
		this.constants();
		this.actions();
	}

	actions(system) {
		const value_input = {
			type:  'textinput',
			label: 'Value',
			id:    'value',
			regex: this.REGEX_NUMBER
		};
		const choices = function (object) {
			return Object.entries(object).map(array => {
				return {id: array[1], label: array[0].toProperCase()};
			});
		};
		let actions = {};
		const commands = Object.entries(this.COMMANDS).filter(c => c[1].access === this.ACCESS.READWRITE);
		for (let [key, command] of commands) {
			let options = [];
			switch (command) {
				case this.COMMANDS.LOCATION:
				case this.COMMANDS.IP_ADDRESS:
				case this.COMMANDS.SUBNET_MASK:
				case this.COMMANDS.TARGET_POSITION:
					// Internal settings we don't want to have options for.
					continue;
				case this.COMMANDS.RELAY_STATUS:
					options.push({
						type:    'dropdown',
						label:   'Action',
						id:      'action',
						default: this.RELAY_STATUS.STOP,
						choices: choices(this.RELAY_STATUS),
					});
					break;
				case this.COMMANDS.SCREEN_POSITION:
					options.push({
						type:    'dropdown',
						label:   'Type',
						id:      'type',
						default: this.POSITION_TYPE.SET,
						choices: choices(this.POSITION_TYPE),
					}, {
						type:    'dropdown',
						label:   'Unit',
						id:      'unit',
						default: this.POSITION_UNITS.INCHES,
						choices: choices(this.POSITION_UNITS),
					}, value_input);
					break;
				case this.COMMANDS.ASPECT_RATIO:
					options.push({
						type:    'dropdown',
						label:   'Aspect Ratio',
						id:      'index',
						default: this.ASPECT_RATIO["Custom 1"],
						choices: choices(this.ASPECT_RATIO),
					});
					break;
				default:
					options.push(value_input);
					break;
			}
			if (options.length > 0) {
				actions[command.value] = {label: key.toProperCase('_'), options: options};
			} else {
				debug(`No options found for ${key}`);
			}
		}
		this.system.emit('instance_actions', this.id, actions);
	}

	action(object) {
		const command = this.COMMANDS.get(object.action);
		const options = object.options;
		switch (command) {
			case this.COMMANDS.RELAY_STATUS:
				this.set(command, options.action);
				break;
			case this.COMMANDS.TARGET_POSITION:
			case this.COMMANDS.SCREEN_POSITION:
				if (options.value !== null) {
					this.set(command, `${options.type} ${Math.round(options.unit * options.value)}`);
				}
				break;
			case this.COMMANDS.ASPECT_RATIO:
				const index = (parseInt(options.index) + 1) % 10;
				this.set(this.COMMANDS.TARGET_POSITION, `${command.value + index}`);
				break;
			default:
				this.log('error', `Unknown command action: ${object.action}`);
				break;
		}
	}

	config_fields() {
		return [{
			type:    'textinput',
			id:      'host',
			label:   'SCB IP Address',
			tooltip: 'The IP of the Screen Control Board',
			width:   6,
			regex:   this.REGEX_IP
		}, {
			type:    'textinput',
			id:      'port',
			label:   'Target Port',
			width:   3,
			default: '3001',
			regex:   this.REGEX_PORT
		}];
	}

	destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy();
			delete this.socket;
		}
		debug("destroy");
	}

	init() {
		this.status(this.STATE_OK);
		debug = this.debug;
		log = this.log;
		this.init_tcp();
	}

	init_tcp() {
		this.destroy();

		if (this.config.host && this.config.port) {
			this.status(this.STATE_WARNING, 'Connecting');
			this.socket = new TCP(this.config.host, this.config.port);

			this.socket.on('status_change', (status, message) => {
				this.status(status, message);
			});

			this.socket.on('error', (err) => {
				debug("Network error", err);
				this.status(this.STATE_ERROR, err);
				this.log('error', `Network error: ${err.message}`);
			});

			this.socket.on('connect', () => {
				this.status(this.STATE_OK);
				debug("Connected");
			});
		}
	}

	updateConfig(config) {
		this.config = config;
		this.init_tcp();
	}

	isConnected() {
		return this.socket !== undefined && this.socket.connected;
	};

	get(command) {
		command = this.COMMANDS.get(command);
		if ([this.ACCESS.READONLY, this.ACCESS.READWRITE].indexOf(command.access) !== -1) {
			this.socket.send(`$ 0 GE ${command.value}\r`);
		}
	};

	set(command, value) {
		command = this.COMMANDS.get(command);
		if ([this.ACCESS.WRITEONLY, this.ACCESS.READWRITE].indexOf(command.access) !== -1) {
			this.socket.send(`# 0 SE ${command.value} ${value}\r`);
		}
	};

	constants() {
		this.POSITION_UNITS = {
			INCHES:      25.4,
			CENTIMETERS: 10.0,
			MILLIMETERS: 1.0,
		};
		this.POSITION_TYPE = {
			RAISE: 'DEC',
			SET:   'FIX',
			LOWER: 'INC'
		};
		this.RELAY_STATUS = {
			STOP: 'ST',
			UP:   'UP',
			DOWN: 'DN',
		};
		this.ASPECT_RATIO = {
			'1:1':           0,
			'1.25:1':        1,
			'1.33:1 (4x3)':  2,
			'1.66:1 (5x4)':  3,
			'1.78:1 (16x9)': 4,
			'Custom 1':      5,
			'Custom 2':      6,
			'Custom 3':      7,
			'Custom 4':      8,
			'Custom 5':      9,
		};
		this.ACCESS = {
			READONLY:  {value: 'R'},
			WRITEONLY: {value: 'W'},
			READWRITE: {value: 'RW'},
		};
		this.COMMANDS = {
			ALL:                 {value: 'AL', access: this.ACCESS.READONLY}, // Possibly broken
			ENABLED:             {value: 'EN', access: this.ACCESS.READONLY},
			LOCATION:            {value: 'LO', access: this.ACCESS.READWRITE},
			VERSION:             {value: 'SV', access: this.ACCESS.READONLY},
			TARGET_DENSITY:      {value: 'TD', access: this.ACCESS.READONLY},
			ROLLER_DIAMETER:     {value: 'RD', access: this.ACCESS.READONLY},
			SLACK_WRAP:          {value: 'SL', access: this.ACCESS.READONLY},
			SCREEN_THICKNESS:    {value: 'ST', access: this.ACCESS.READONLY},
			SCREEN_WIDTH:        {value: 'SW', access: this.ACCESS.READONLY},
			SCREEN_HEIGHT:       {value: 'SH', access: this.ACCESS.READONLY},
			MAC_ADDRESS:         {value: 'MA', access: this.ACCESS.READONLY},
			SENSOR_STATUS:       {value: 'SE', access: this.ACCESS.READONLY},
			MASTER_SLAVE_STATUS: {value: 'MS', access: this.ACCESS.READONLY},
			RELAY_STATUS:        {value: 'RE', access: this.ACCESS.READWRITE},
			UPPER_LIMIT:         {value: 'UL', access: this.ACCESS.READONLY},
			LOWER_LIMIT:         {value: 'LM', access: this.ACCESS.READONLY},
			SCREEN_POSITION:     {value: 'MM', access: this.ACCESS.READWRITE},
			TARGET_POSITION:     {value: 'TA', access: this.ACCESS.READWRITE},
			ASPECT_RATIO:        {value: 'A', access: this.ACCESS.READWRITE},
			AC:                  {value: 'AC', access: this.ACCESS.READONLY},
			IP_ADDRESS:          {value: 'IP', access: this.ACCESS.READWRITE},
			SUBNET_MASK:         {value: 'SN', access: this.ACCESS.READWRITE},
			DHCP:                {value: 'DH', access: this.ACCESS.READONLY},
			SERIAL_FLASH:        {value: 'SF', access: this.ACCESS.READONLY},
			RESET:               {value: 'RS', access: this.ACCESS.WRITEONLY},
			get:                 command => {
				if (typeof command === 'string') {
					command = Object.values(this.COMMANDS).find(prop => prop.value === command);
				}
				if (typeof command !== 'object') {
					debug('Unknown SCB command');
				}
				return command;
			}
		};
	}
}

String.prototype.toProperCase = function (split = ' ') {
	return this.split(split).map(w => {
		return w[0].toUpperCase() + w.substr(1).toLowerCase();
	}).join(' ');
};

exports = module.exports = instance;
