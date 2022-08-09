const electron = require('electron');
const ipcRenderer = electron.ipcRenderer;
const zlib = require('zlib');
const parser = require('epg-parser');
const axios = require('axios');
import {
    EPG_ERROR,
    EPG_FETCH,
    EPG_FETCH_DONE,
    EPG_GET_CHANNELS,
    EPG_GET_CHANNELS_DONE,
    EPG_GET_PROGRAM,
    EPG_GET_PROGRAM_DONE,
} from '../shared/ipc-commands';
import { EpgChannel } from '../src/app/player/models/epg-channel.model';
import { EpgProgram } from '../src/app/player/models/epg-program.model';

// EPG data store
let EPG_DATA: { channels: EpgChannel[]; programs: EpgProgram[] } = {
    channels: [],
    programs: [],
};
const loggerLabel = '[EPG Worker]';

/**
 * Fetches the epg data from the given url
 * @param epgUrl url of the epg file
 */
const fetchEpgDataFromUrl = (epgUrl: string) => {
    try {
        let axiosConfig = {};
        if (epgUrl.endsWith('.gz')) {
            axiosConfig = {
                responseType: 'arraybuffer',
            };
        }
        axios
            .get(epgUrl.trim(), axiosConfig)
            .then((response) => {
                console.log(loggerLabel, 'url content was fetched...');
                const { data } = response;
                if (epgUrl.endsWith('.gz')) {
                    console.log(loggerLabel, 'start unzipping...');
                    zlib.gunzip(data, (_err, output) => {
                        parseAndSetEpg(output);
                    });
                } else {
                    parseAndSetEpg(data);
                }
            })
            .catch((err) => {
                console.log(loggerLabel, err);
                ipcRenderer.send(EPG_ERROR);
            });
    } catch (error) {
        console.log(loggerLabel, error);
        ipcRenderer.send(EPG_ERROR);
    }
};

/**
 * Parses and sets the epg data
 * @param xmlString xml file content from the fetched url as string
 */
const parseAndSetEpg = (xmlString) => {
    console.log(loggerLabel, 'start parsing...');
    const parsedEpg = parser.parse(xmlString.toString());
    EPG_DATA = {
        channels: [...EPG_DATA.channels, ...parsedEpg.channels],
        programs: [...EPG_DATA.programs, ...parsedEpg.programs],
    };
    ipcRenderer.send(EPG_FETCH_DONE);
    console.log(loggerLabel, 'done, parsing was finished...');
};

// fetches epg data from the provided URL
ipcRenderer.on(EPG_FETCH, (event, arg) => {
    console.log(loggerLabel, 'epg fetch command was triggered');
    fetchEpgDataFromUrl(arg);
});

// returns the epg data for the provided channel name and date
ipcRenderer.on(EPG_GET_PROGRAM, (event, args) => {
    const channelName = args.channel.name;
    const tvgId = args.channel.tvg?.id;
    if (!EPG_DATA || !EPG_DATA.channels) return;
    const foundChannel = EPG_DATA?.channels?.find((epgChannel) => {
        if (tvgId && tvgId === epgChannel.id) {
            return epgChannel;
        } else if (
            epgChannel.name.find((nameObj) => {
                if (
                    nameObj.value &&
                    nameObj.value.trim() === channelName.trim()
                )
                    return nameObj;
            })
        ) {
            return epgChannel;
        }
    });

    if (foundChannel) {
        const programs = EPG_DATA?.programs?.filter(
            (ch) => ch.channel === foundChannel.id
        );
        ipcRenderer.send(EPG_GET_PROGRAM_DONE, {
            payload: { channel: foundChannel, items: programs },
        });
    } else {
        console.log('EPG program for the channel was not found...');
        ipcRenderer.send(EPG_GET_PROGRAM_DONE, {
            payload: { channel: {}, items: [] },
        });
    }
});

ipcRenderer.on(EPG_GET_CHANNELS, (event, args) => {
    ipcRenderer.send(EPG_GET_CHANNELS_DONE, {
        payload: EPG_DATA,
    });
});
