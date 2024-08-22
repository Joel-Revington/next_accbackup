import { authRefreshMiddleware, backupData, backupSpecificData } from "../services";
import { PassThrough } from 'stream';

function sanitizeName(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 255);
}

export default async function handler(req, res) {
    await new Promise((resolve, reject) => {
        authRefreshMiddleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    try {
        const accessToken = req.internalOAuthToken.access_token;
        const passThrough = new PassThrough();

        res.setHeader('Content-Disposition', 'attachment; filename=backup.zip');
        res.setHeader('Content-Type', 'application/zip');

        if (req.query.hub_id && req.query.project_id) {
            const hubs = await getHubs(accessToken);
            const hub = hubs.find(h => h.id === req.query.hub_id);
            const hubName = hub ? hub.attributes.name : 'backup';
            const sanitizedHubName = sanitizeName(hubName);

            // Directly stream the ZIP for the specific hub and project
            await backupSpecificData(req, passThrough, accessToken, req.query.hub_id, req.query.project_id);
        } else {
            // Directly stream the ZIP for all hubs and projects
            await backupData(req, passThrough, accessToken);
        }
        
        passThrough.pipe(res).on('finish', () => {
            console.log('Backup process completed successfully.');
        });
    } catch (err) {
        console.error('Error during backup process:', err);
        res.status(500).send('Backup process encountered an error.');
    }
}