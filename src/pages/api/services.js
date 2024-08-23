import axios from 'axios';
import { SdkManagerBuilder } from '@aps_sdk/autodesk-sdkmanager';
import { AuthenticationClient, Scopes, ResponseType, GrantType } from '@aps_sdk/authentication';
import { DataManagementClient } from '@aps_sdk/data-management';
const JSZip = require('jszip')


export const sdkManager = SdkManagerBuilder.create().build();
export const authenticationClient = new AuthenticationClient(sdkManager);
export const dataManagementClient = new DataManagementClient(sdkManager);

const getAuthorizationUrl = () => {
    return authenticationClient.authorize(process.env.NEXT_APP_APS_CLIENT_ID, ResponseType.Code, process.env.NEXT_APP_APS_CALLBACK_URL, [
        Scopes.DataRead,
        Scopes.DataCreate,
        Scopes.ViewablesRead
    ]);
};

export const getAccessToken = async (code) => {
    try {
        const clientId = process.env.NEXT_APP_APS_CLIENT_ID
        const clientSecret = process.env.NEXT_APP_APS_CLIENT_SECRET
        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenResponse = await axios.post("https://developer.api.autodesk.com/authentication/v2/token",
            new URLSearchParams({
                grant_type:'authorization_code',
                code: code,
                redirect_uri: process.env.NEXT_APP_APS_CALLBACK_URL,
            }),{
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`,
                },
            });
        return tokenResponse.data;
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        throw error;
    }
};

// const refreshAccessToken = async (refreshToken) => {
//     try {
//         const internalCredentials = await authenticationClient.getRefreshToken(
//             process.env.NEXT_APP_APS_CLIENT_ID,
//             refreshToken,
//             {
//                 clientSecret: process.env.NEXT_APP_APS_CLIENT_SECRET,
//                 scopes: [Scopes.DataRead, Scopes.DataCreate],
//             }
//         );

//         const publicCredentials = await authenticationClient.getRefreshToken(
//             process.env.NEXT_APP_APS_CLIENT_ID,
//             internalCredentials.refresh_token,
//             {
//                 clientSecret: process.env.NEXT_APP_APS_CLIENT_SECRET,
//                 scopes: [Scopes.ViewablesRead],
//             }
//         );

//         return {
//             publicToken: publicCredentials.access_token,
//             internalToken: internalCredentials.access_token,
//             refreshToken: publicCredentials.refresh_token,
//             expiresAt: Date.now() + internalCredentials.expires_in * 1000
//         };
//     } catch (err) {
//         console.error('Error refreshing access token:', err);
//         throw err;
//     }
// };

const getUserProfile = async (accessToken) => {
    if(accessToken){
        try {
            const response = await authenticationClient.getUserInfo(accessToken);
            return response;
        } catch (err) {
            console.error('Error fetching user profile:', err);
            throw err;
        }
    }
};

const getHubs = async (accessToken) => {
    if(accessToken){
        try {
            const response = await dataManagementClient.getHubs(accessToken);
            return response.data;
        } catch (err) {
            console.error('Error fetching hubs:', err);
            throw err;
        }
    }
};

const getProjects = async (hubId, accessToken) => {
    try {
        const response = await dataManagementClient.getHubProjects(accessToken, hubId);
        return response.data;
    } catch (err) {
        console.error('Error fetching projects:', err);
        throw err;
    }
};

const getProjectContents = async (hubId, projectId, folderId, accessToken) => {
    try {
        const response = folderId
            ? await dataManagementClient.getFolderContents(accessToken, projectId, folderId)
            : await dataManagementClient.getProjectTopFolders(accessToken, hubId, projectId);

        return response.data;
    } catch (err) {
        console.error('Error fetching project contents:', err);
        throw err;
    }
};

const getItemContents = async (projectId, itemId, accessToken) => {
    try {
        const response = await axios.get(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${itemId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching item contents:', error);
        throw error;
    }
};

const getFileContent = async (hubId, projectId, itemId, accessToken) => {
    try {
        const itemVersions = await getItemVersions(projectId, itemId, accessToken);
        const latestVersion = itemVersions[0]; // Assuming the first version is the latest one
        const url = latestVersion?.relationships?.storage?.meta?.link?.href;
        
        if (!url) {
            throw new Error("No download URL found for the file.");
        }

        const response = await axios.get(url, { responseType: 'stream', headers: { Authorization: `Bearer ${accessToken}` } });
        return {
            name: latestVersion.attributes.displayName,
            data: response.data
        };
    } catch (err) {
        console.error('Error getting file content:', err);
        throw err;
    }
};

const sanitizeName = (name) => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 255);

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);

    promise
        .then((result) => {
            clearTimeout(timeout);
            resolve(result);
        })
        .catch((err) => {
            clearTimeout(timeout);
            reject(err);
        });
});

// const downloadFile = async (url, accessToken) => {
//     if (!url) {
//         console.log("Unsupported Version");
//         return null;
//     }
//     try {
//         const response = await axios({
//             method: 'GET',
//             url,
//             responseType: 'stream',
//             headers: {
//                 Authorization: `Bearer ${accessToken}`
//             }
//         });
//         return response.data;
//     } catch (err) {
//         console.error('Error downloading file:', err);
//         return null;
//     }
// };

const backupData = async (req, stream, accessToken) => {
    if (!accessToken) {
        stream.emit('error', new Error('Access token is missing.'));
    }

    const zip = new JSZip();

    try {
        const hubs = await getHubs(accessToken);

        for (const hub of hubs) {
            const sanitizedHubName = sanitizeName(hub.attributes.name);
            const projects = await getProjects(hub.id, accessToken);
            console.log(projects);
            if (projects.length === 0) {
                console.log(`No projects found for hub: ${sanitizedHubName}`);
                continue;
            } else {
            for (const project of projects) {
                const sanitizedProjectName = sanitizeName(project.attributes.name);
                console.log(`Processing project: ${sanitizedProjectName}`);

                const projectContents = await getProjectContents(hub.id, project.id, null, accessToken);

                for (const content of projectContents) {
                    if (content.type === 'folders') {
                        await backupFolderContents(hub.id, project.id, content.id, zip, `${sanitizedHubName}/${sanitizedProjectName}`, accessToken);
                    } else if (content.type === 'items') {
                        await backupFileContent(hub.id, project.id, content.id, zip, `${sanitizedHubName}/${sanitizedProjectName}`, accessToken);
                    }
                }
            }
        }

        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        stream.end(zipBuffer)
        console.log('Backup completed successfully.');

    } catch (error) {
        console.error('Error during backup data:', error);
        res.status(500).json({ error: 'Failed to backup data.' });
    }
};



const backupSpecificData = async (req, stream, accessToken, hubId, projectId) => {
    const zip = new JSZip();
    try {
        const hub = (await getHubs(accessToken)).find(h => h.id === hubId);
        const sanitizedHubName = sanitizeName(hub.attributes.name);
        const project = (await getProjects(hubId, accessToken)).find(p => p.id === projectId);
        const sanitizedProjectName = sanitizeName(project.attributes.name);

        const projectContents = await getProjectContents(hubId, projectId, null, accessToken);

        for (const content of projectContents) {
            if (content.type === 'folders') {
                await backupFolderContents(hubId, projectId, content.id, zip, sanitizedProjectName, accessToken);
            } else if (content.type === 'items') {
                await backupFileContent(hubId, projectId, content.id, zip, sanitizedProjectName, accessToken);
            }
        }

        // Generate the zip file and pipe to the response
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        stream.end(zipBuffer);
    } catch (error) {
        console.error('Error during backup specific data:', error);
        stream.destroy(); // End the stream on error
        throw new Error('Failed to backup specific data.');
    }
};

const backupFileContent = async (hubId, projectId, itemId, zip, projectName, accessToken) => {
    try {
        const fileContent = await getFileContent(hubId, projectId, itemId, accessToken);
        const sanitizedFileName = sanitizeName(fileContent.name);

        // Add file to the zip archive
        zip.file(`${projectName}/${sanitizedFileName}`, fileContent.data);
    } catch (error) {
        console.error(`Error backing up file with ID ${itemId}:`, error);
    }
};

const backupFolderContents = async (hubId, projectId, folderId, zip, basePath, accessToken) => {
    try {
        const folderContents = await withTimeout(getProjectContents(hubId, projectId, folderId, accessToken), 15000);
        for (const item of folderContents) {
            const itemName = sanitizeName(item.attributes?.displayName);
            const itemPath = basePath ? `${basePath}/${itemName}` : itemName;

            if (item.type === 'folders') {
                await backupFolderContents(hubId, projectId, item.id, zip, itemPath, accessToken);
            } else if (item.type === 'items') {
                await backupFileContent(hubId, projectId, item.id, zip, itemPath, accessToken);
            }
        }
    } catch (error) {
        console.error('Error backing up folder contents:', error);
    }
};


const getItemVersions = async (projectId, itemId, accessToken) => {
    try {
        const resp = await withTimeout(dataManagementClient.getItemVersions(accessToken, projectId, itemId), 15000);
        console.log(resp.data);
        return resp.data;
    } catch (err) {
        console.log(err);
    }
};

export {
    getAuthorizationUrl,
    // authCallbackMiddleware,
    // authRefreshMiddleware,
    getUserProfile,
    getHubs,
    getProjects,
    getProjectContents,
    getItemContents,
    getItemVersions,
    backupData,
    backupSpecificData,
}
