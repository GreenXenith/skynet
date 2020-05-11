// Libs
const Discord = require("discord.js");
const IRC = require("irc-framework");

// Config
const config = require('./config.json');
const {token} = config;
const defaultAvatar = "https://i.imgur.com/KBGaTxQ.png";

// Error if missing configuration
const needed = {
	token: true,
	irc: {
		channel: true,
		server: true,
		nickname: true
	},

	discord: {
		server: true,
		channel: true
	},

	minetest: {
		nickname: true
	}
};

function missingConfig(conf, needed) {
	for (key in needed) {
		if (conf.hasOwnProperty(key)) {
			if (typeof(needed[key]) == "object") {
				return missingConfig(conf[key], needed[key]);
			}
		} else {
			console.log("Error: Missing configurations! See config.json.example.");
			return true;
		}
	}
}

if (missingConfig(config, needed)) return;

// Clients
const discord = new Discord.Client();
const irc = new IRC.Client();

// Ready events
let ready = 0;
function amReady() {
	ready += 1;
	if (ready >= 3) {
		ready = true;
		console.log("Skynet is online.")
	}
}

discord.once("ready", () => {
	console.log(`Logged in to Discord as ${discord.user.tag}.`);

	channel = discord.guilds.cache.get(config.discord.server).channels.cache.get(config.discord.channel);
	channel.fetchWebhooks().then(hooks => {
		let hook = hooks.find(val => val.owner == discord.user);
		if (!hook) {
			channel.createWebhook("Skynet", {avatar: "https://i.imgur.com/WPIFG2B.png"}).then(newHook => {
				discord.relay = newHook;
				discord.relayChannel = channel;
				amReady();
				console.log("Created new relay webhook.");
			});
		} else {
			discord.relay = hook;
			discord.relayChannel = channel;
			amReady();
		}
	});

	discord.user.setActivity("everyone.", {type: "LISTENING"});
});

irc.on("connected", function() {
	console.log(`Connected to ${config.irc.server}.`);
	irc.join(config.irc.channel);
	amReady();
});

irc.on("join", event => {
	if (event.nick == config.irc.nickname) {
		console.log(`Joined ${event.channel}.`)
		amReady();
	}
});

// Conversion functions
const snowflakes = {
	user: function(message, content) {
		message.mentions.users.forEach(user => {
			content = content.replace(`<@!${user.id}>`, `@${user.username}`);
		});
		return content;
	},
	channel: function(message, content) {
		message.mentions.channels.forEach(channel => {
			content = content.replace(`<#${channel.id}>`, `#${channel.name}`);
		});
		return content;
	},
	role: function(message, content) {
		message.mentions.roles.forEach(role => {
			content = content.replace(`<@&${role.id}>`, `@&${role.name}`);
		});
		return content;
	},
};

function parseSnowflakes(message, content) {
	for (const prop in snowflakes) {
		content = snowflakes[prop](message, content);
	}
	return content;
}

function discordToIRC(message) {
	let content = message.content;

	content = content.replace(/\n/g, " "); // Newlines

	// content = content.replace(/\|\|.+?\|\|/g, "[SPOILER]");

	content = parseSnowflakes(message, content);

	content = content.replace(/<:(\w+?):\d+?>/g, ":$1:"); // Custom emotes

	return content;
}

function IRCToDiscord(message) {
	const chars = [
		0x1D,
		0x02,
		0x1F,
	];

	for (var char in chars) {
		const rep = new RegExp(String.fromCharCode(char), "g");
		message = message.replace(rep, "");
	}

	return message;
}

// Command queue
const queue = [];
let last = ["", 0];

// Events
discord.on("message", message => {
	if (!ready) return;
	if (message.author == discord.user) return;

	if (message.channel == discord.relayChannel && !message.webhookID && !message.content.toLowerCase().startsWith("[offirc]")) {
		const lmc = message.content.toLowerCase(); // lowercase message content
		const sender = message.guild.members.cache.get(message.author.id).nickname || message.author.username;
		const msg = discordToIRC(message);

		if (lmc.startsWith(`${config.minetest.nickname.toLowerCase()},`) || lmc.match(/^!\w/)) {
			irc.say(config.irc.channel, `Command sent by ${sender}:`);
			irc.say(config.irc.channel, `${msg}`)
		} else {
			irc.say(config.irc.channel, `<${sender}> ${msg}`);
		}
	} else if (message.channel.type === "dm") {
		const msg = discordToIRC(message);
		let args = msg.split(" ");

		let aka = "";
		const nick = discord.guilds.cache.get(config.discord.server).members.cache.get(message.author.id).nickname;
		if (nick) aka = ` (aka ${nick})`;

		if (args[0].startsWith("@")) {
			args.splice(1, 0, `from ${message.author.tag}${aka}:`);
		}

		irc.say(config.minetest.nickname, args.join(" "));
		queue.push(message.channel.id);
	}
});

irc.on("message", event => {
	if (!ready) return;

	let avatar = defaultAvatar;
	if (event.type == "privmsg") {
		if (event.target == config.irc.channel) {
			let at = "@IRC";
			if (event.nick == config.minetest.nickname) {
				at = "";
				avatar = config.minetest.avatar || avatar;
			}
			discord.relay.send(IRCToDiscord(event.message), {
				username: `${event.nick}${at}`,
				avatarURL: avatar,
				disableEveryone: true,
			});
		} else {
			if (event.nick == config.minetest.nickname) {
				if (event.message.startsWith("<")) {
					const args = event.message.split(/ +/g);
					let sender = args.shift().match(/^<([\w_-]+)>/);

					if (!sender) return;
					sender = sender[1];
					const target = args.shift();

					if (!target) return;
					const msg = args.join(" ");

					matches = {};
					discord.guilds.cache.get(config.discord.server).members.forEach(member => {
						const id = member.user.id;
						matches[id] = 0;
						if (member.user.tag == target) {
							matches[id] += 5;
						} else if (member.user.username == target) {
							matches[id] += 3;
						} else if (member.nickname == target) {
							matches[id] += 1;
						}
						if (matches[id] === 0) {
							delete matches[id];
						}
					});

					const match = Object.entries(matches).sort((a, b) => {return a < b})[0];
					if (!match) {
						irc.say(config.minetest.nickname, `@${sender} Could not find Discord user "${target}".`)
						return;
					}

					const id = match[0];
					discord.fetchUser(id).then(user => {
						let aka = "";
						const nick = discord.guilds.cache.get(config.discord.server).members.cache.get(user.id).nickname;
						if (nick) aka = ` (aka ${nick})`;
						irc.say(config.minetest.nickname, `@${sender} Message sent to ${user.tag}${aka}.`)
						user.send(`PM from ${sender}@${config.minetest.nickname}: ${msg}`);
					})
				} else {
					let id = queue.shift();
					if (!id) {
						if ((Date.now() / 1000) - last[1] <= 1) {
							id = last[0];
						} else {
							last = ["", 0];
							return;
						}
					} else {
						last = [id, Date.now() / 1000];
					}
					discord.channels.cache.get(id).send(IRCToDiscord(event.message));
				}
			}
		}
	} else if (event.type == "notice") {
		console.log(`NOTICE: ${IRCToDiscord(event.message)}`);
	}
});

irc.on("action", event => {
	let avatar = defaultAvatar;
	discord.relay.send(`_${IRCToDiscord(event.message)}_`, {
		username: `${event.nick}@IRC`,
		avatarURL: avatar,
		disableEveryone: true,
	});
});

function notice(payload) {
	discord.relay.send(payload, {
		username: config.irc.channel,
		avatarURL: defaultAvatar,
	})
}

irc.on("join", event => {
	notice(`_${event.nick.replace(/[_*|~`]/g, "\\$&")}_ has joined the channel.`);
});

irc.on("part", event => {
	notice(`_${event.nick.replace(/[_*|~`]/g, "\\$&")}_ has left the channel.`);
});

irc.on("kick", event => {
	notice(`_${event.kicked.replace(/[_*|~`]/g, "\\$&")}_ has been kicked from the channel by _${event.nick}_.`);
});

irc.on("quit", event => {
	notice(`_${event.nick.replace(/[_*|~`]/g, "\\$&")}_ has quit (_${event.message || "Leaving"}_)`);
});

// Launch
discord.login(token);

irc.connect({
	host: config.irc.server,
	port: 6667,
	username: "Skynet",
	nick: config.irc.nickname,
});

// Proper exit
function exit() {
	irc.quit();
	discord.relay.send(`_${config.irc.nickname}_ has quit (_Relay shutting down_)`).then(() => {
		process.exit();
	});
}

process.on("exit", exit);
process.on("SIGINT", exit); // ctrl + c
process.on("SIGUSR1", exit); // kill
process.on("SIGUSR2", exit); // kill
process.on("uncaughtException", exit);
