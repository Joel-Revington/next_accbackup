import axios from 'axios';
import { SdkManagerBuilder } from '@aps_sdk/autodesk-sdkmanager';
import { AuthenticationClient, Scopes, ResponseType, GrantType } from '@aps_sdk/authentication';
import { DataManagementClient } from '@aps_sdk/data-management';
import archiver from 'archiver';


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

const refreshAccessToken = async (refreshToken) => {
    try {
        const internalCredentials = await authenticationClient.getRefreshToken(
            process.env.NEXT_APP_APS_CLIENT_ID,
            refreshToken,
            {
                clientSecret: process.env.NEXT_APP_APS_CLIENT_SECRET,
                scopes: [Scopes.DataRead, Scopes.DataCreate],
            }
        );

        const publicCredentials = await authenticationClient.getRefreshToken(
            process.env.NEXT_APP_APS_CLIENT_ID,
            internalCredentials.refresh_token,
            {
                clientSecret: process.env.NEXT_APP_APS_CLIENT_SECRET,
                scopes: [Scopes.ViewablesRead],
            }
        );

        return {
            publicToken: publicCredentials.access_token,
            internalToken: internalCredentials.access_token,
            refreshToken: publicCredentials.refresh_token,
            expiresAt: Date.now() + internalCredentials.expires_in * 1000
        };
    } catch (err) {
        console.error('Error refreshing access token:', err);
        throw err;
    }
};


const getUserProfile = async (accessToken) => {
    try {
        const response = await authenticationClient.getUserInfo(accessToken);
        return response;
    } catch (err) {
        console.error('Error fetching user profile:', err);
        throw err;
    }
};

const getHubs = async (accessToken) => {
    
    try {
        const response = await dataManagementClient.getHubs(accessToken);
        return response.data;
    } catch (err) {
        console.error('Error fetching hubs:', err);
        throw err;
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

const downloadFile = async (url, accessToken) => {
    if (!url) {
        console.log("Unsupported Version");
        return null;
    }
    try {
        const response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        return response.data;
    } catch (err) {
        console.error('Error downloading file:', err);
        return null;
    }
};

const backupFolderContents = async (hubId, projectId, folderId, archive, basePath, accessToken) => {
    try {
        const folderContents = await withTimeout(getProjectContents(hubId, projectId, folderId, accessToken), 15000);
        for (const item of folderContents) {
            const itemName = sanitizeName(item.attributes?.displayName);
            const itemPath = basePath ? `${basePath}/${itemName}` : itemName;

            if (item.type === 'folders') {
                await backupFolderContents(hubId, projectId, item.id, archive, itemPath, accessToken);
            } else if (item.type === 'items') {
                await backupFileContent(hubId, projectId, item.id, archive, itemPath, accessToken);
            }
        }
    } catch (error) {
        console.error('Error backing up folder contents:', error);
    }
};

const backupData = async (req, stream, accessToken) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(stream);

    try {
        const hubs = await getHubs(accessToken);

        for (const hub of hubs) {
            const sanitizedHubName = sanitizeName(hub.attributes.name);
            const projects = await getProjects(hub.id, accessToken);

            for (const project of projects) {
                const sanitizedProjectName = sanitizeName(project.attributes.name);
                console.log(sanitizedProjectName);

                const projectContents = await getProjectContents(hub.id, project.id, null, accessToken);

                for (const content of projectContents) {
                    if (content.type === 'folders') {
                        console.log("folder");
                        await backupFolderContents(hub.id, project.id, content.id, archive, `${sanitizedHubName}/${sanitizedProjectName}`, accessToken);
                    } else if (content.type === 'items') {
                        console.log("item");
                        await backupFileContent(hub.id, project.id, content.id, archive, `${sanitizedHubName}/${sanitizedProjectName}`, accessToken);
                    }
                }
            }
        }

        console.log('Finalizing the archive...');
        archive.finalize().then(() => {
            console.log('Archive finalized successfully.');
            stream.end();
        }).catch((error) => {
            console.error('Error finalizing archive:', error);
            stream.status(500).send({ error: 'Failed to finalize archive.' });
        });
    } catch (error) {
        console.error('Error during backup data:', error);
        stream.status(500).send({ error: 'Failed to backup data.' });
    }
};

const backupSpecificData = async (req, stream, accessToken, hubId, projectId) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(stream);

    try {
        const hub = (await getHubs(accessToken)).find(h => h.id === hubId);
        const sanitizedHubName = sanitizeName(hub.attributes.name);
        const project = (await getProjects(hubId, accessToken)).find(p => p.id === projectId);
        const sanitizedProjectName = sanitizeName(project.attributes.name);
        console.log(sanitizedProjectName);

        const projectContents = await getProjectContents(hubId, projectId, null, accessToken);

        for (const content of projectContents) {
            if (content.type === 'folders') {
                console.log("folder");
                await backupFolderContents(hubId, projectId, content.id, archive, sanitizedProjectName, accessToken);
            } else if (content.type === 'items') {
                console.log("item");
                await backupFileContent(hubId, projectId, content.id, archive, sanitizedProjectName, accessToken);
            }
        }

        console.log('Finalizing the archive...');
        archive.finalize().then(() => {
            console.log('Archive finalized successfully.');
            stream.end();
        }).catch((error) => {
            console.error('Error finalizing archive:', error);
            stream.status(500).send({ error: 'Failed to finalize archive.' });
        });
    } catch (error) {
        console.error('Error during backup specific data:', error);
        stream.status(500).send({ error: 'Failed to backup specific data.' });
    }
};

const backupFileContent = async (hubId, projectId, itemId, archive, projectName, accessToken) => {
    console.log("item-filetype");
    try {
        const fileContent = await getFileContent(hubId, projectId, itemId, accessToken);
        const sanitizedFileName = sanitizeName(fileContent.name);

        // Adding file to the archive with its relative path
        archive.append(fileContent.data, { name: `${projectName}/${sanitizedFileName}` });
    } catch (error) {
        console.error(`Error backing up file with ID ${itemId}:`, error);
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