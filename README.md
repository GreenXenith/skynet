# Skynet Relay #
Minetest-IRC-Discord Relay

Uses NodeJS, `discord.js`, and `irc-framework` (by KiwiIRC).  

## Installation ##

```
git clone https://github.com/GreenXenith/skynet.git
cd skynet
npm install
``` 

Skynet requires a `config.json`. See `config.json.example`.  

## Usage ##

To use the bot, run `node .` in the bot directory.  
I recommend you use a cron job or systemd service  

### Possible issues ###
* DM command responses might get sent to the wrong person .. this was hopefully fixed.
* Discord rich presence will turn off at some point - unknown cause.
