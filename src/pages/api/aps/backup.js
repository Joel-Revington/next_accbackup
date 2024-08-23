// pages/api/aps/backup.js
import { backupData, backupSpecificData, getHubs } from '../services'; // Ensure these imports are correct
import { PassThrough } from 'stream';

function sanitizeName(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 255);
}

export default async function handler(req, res) {
    const { access_token } = req.cookies;

    if (!access_token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const passThrough = new PassThrough();

        res.setHeader('Content-Disposition', 'attachment; filename=backup.zip');
        res.setHeader('Content-Type', 'application/zip');

        passThrough.on('error', (err) => {
            console.error('Stream error:', err);
            res.status(500).send('Stream encountered an error.');
        });

        // Backup Logic
        if (req.query.hub_id && req.query.project_id) {
            console.log(req.query.hub_id, req.query.project_id);
            
            // Backup a specific project
            const hubs = await getHubs(access_token);
            const hub = hubs.find(h => h.id === req.query.hub_id);

            if (!hub) {
                return res.status(404).json({ error: 'Hub not found' });
            }

            const sanitizedHubName = sanitizeName(hub.attributes.name);
            await backupSpecificData(req, passThrough, access_token, req.query.hub_id, req.query.project_id);
        } else {
            // Backup all projects
            await backupData(req, passThrough, access_token);
        }

        passThrough.pipe(res).on('finish', () => {
            console.log('Backup process completed successfully.');
        });

    } catch (err) {
        console.error('Error during backup process:', err);
        res.status(500).send('Backup process encountered an error.');
    }
}
