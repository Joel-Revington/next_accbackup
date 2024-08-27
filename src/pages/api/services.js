import axios from "axios";
import { SdkManagerBuilder } from "@aps_sdk/autodesk-sdkmanager";
import {
  AuthenticationClient,
  Scopes,
  ResponseType,
  GrantType,
} from "@aps_sdk/authentication";
import { DataManagementClient } from "@aps_sdk/data-management";
const archiver = require("archiver");
const JSZip = require("jszip");

export const sdkManager = SdkManagerBuilder.create().build();
export const authenticationClient = new AuthenticationClient(sdkManager);
export const dataManagementClient = new DataManagementClient(sdkManager);

const getAuthorizationUrl = () => {
  return authenticationClient.authorize(
    process.env.NEXT_APP_APS_CLIENT_ID,
    ResponseType.Code,
    process.env.NEXT_APP_APS_CALLBACK_URL,
    [Scopes.DataRead, Scopes.DataCreate, Scopes.ViewablesRead]
  );
};

export const getAccessToken = async (code) => {
  try {
    const clientId = process.env.NEXT_APP_APS_CLIENT_ID;
    const clientSecret = process.env.NEXT_APP_APS_CLIENT_SECRET;
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );
    const tokenResponse = await axios.post(
      "https://developer.api.autodesk.com/authentication/v2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.NEXT_APP_APS_CALLBACK_URL,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authHeader}`,
        },
      }
    );
    return tokenResponse.data;
  } catch (error) {
    console.error("Error exchanging code for token:", error);
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
  if (accessToken) {
    try {
      const response = await authenticationClient.getUserInfo(accessToken);
      return response;
    } catch (err) {
      console.error("Error fetching user profile:", err);
      throw err;
    }
  }
};

const getHubs = async (accessToken) => {
  if (accessToken) {
    try {
      const response = await dataManagementClient.getHubs(accessToken);
      return response.data;
    } catch (err) {
      console.error("Error fetching hubs:", err);
      throw err;
    }
  }
};

const getProjects = async (hubId, accessToken) => {
  try {
    const response = await dataManagementClient.getHubProjects(
      accessToken,
      hubId
    );
    return response.data;
  } catch (err) {
    console.error("Error fetching projects:", err);
    throw err;
  }
};

const getProjectContents = async (hubId, projectId, folderId, accessToken) => {
  try {
    const response = folderId
      ? await dataManagementClient.getFolderContents(
          accessToken,
          projectId,
          folderId
        )
      : await dataManagementClient.getProjectTopFolders(
          accessToken,
          hubId,
          projectId
        );

    return response.data;
  } catch (err) {
    console.error("Error fetching project contents:", err);
    throw err;
  }
};

const getItemContents = async (projectId, itemId, accessToken) => {
  try {
    const response = await axios.get(
      `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${itemId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching item contents:", error);
    throw error;
  }
};

const sanitizeName = (name) =>
  name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").substring(0, 255);

const withTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Operation timed out")),
      timeoutMs
    );

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
      method: "GET",
      url,
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  } catch (err) {
    console.error("Error downloading file:", err);
    return null;
  }
};

const retry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    console.warn(`Retrying due to error: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay);
  }
};

const backupAllFileContent = async (
  hubId,
  projectId,
  itemId,
  archive,
  projectName,
  accessToken
) => {
  try {
    const itemVersions = await getItemVersions(projectId, itemId, accessToken);
    // Iterate over each version and back it up
    for (const version of itemVersions) {
      const versionName = sanitizeName(version.attributes.displayName);
      const url = version?.relationships?.storage?.meta?.link?.href;
      if (url === undefined) {
        console.error(
          `No download URL found for version of file ${versionName}. Skipping...`
        );
        continue;
      } else {
        const response = await withTimeout(
          downloadFile(url, accessToken),
          15000
        );
        if (!response) {
          console.log(
            `Failed to download file for version of ${versionName}. Skipping...`
          );
          continue;
        }
        // Add each version of the file to the zip archive with a unique name
        archive.append(response, { name: `${projectName}` });
        console.log(`Added ${versionName} to archive.`);
        // zip.file(`${projectName}/${version?.attributes?.name}`, response);
      }
    }
  } catch (error) {
    console.error(`Error backing up file with ID ${itemId}:`, error);
  }
};

const backupAllFolderContents = async (
  hubId,
  projectId,
  folderId,
  archive,
  basePath,
  accessToken
) => {
  try {
    const folderContents = await withTimeout(
      getProjectContents(hubId, projectId, folderId, accessToken),
      15000
    );
    for (const item of folderContents) {
      const itemName = sanitizeName(item.attributes?.displayName);
      const itemPath = basePath ? `${basePath}/${itemName}` : itemName;
      if (item.type === "folders") {
        await backupAllFolderContents(
          hubId,
          projectId,
          item.id,
          archive,
          itemPath,
          accessToken
        );
      } else if (item.type === "items") {
        await withTimeout(
          backupAllFileContent(
            hubId,
            projectId,
            item.id,
            archive,
            itemPath,
            accessToken
          ),
          15000
        );
      }
    }
  } catch (error) {
    console.error("Error backing up folder contents:", error);
  }
};

const backupData = async (req, res, accessToken) => {
  if (!accessToken) {
    res.status(401).json({ error: "Access token is missing." });
    return;
  }
  const archive = archiver("zip", { zlib: { level: 9 } });
  res.setHeader("Content-Disposition", "attachment; filename=backup.zip");
  res.setHeader("Content-Type", "application/zip");
  archive.on("error", (err) => {
    throw err;
  });
  // Pipe the archive data to the response
  archive.pipe(res);

  try {
    const hubs = await getHubs(accessToken);
    for (const hub of hubs) {
      const sanitizedHubName = sanitizeName(hub.attributes.name);
      const projects = await getProjects(hub.id, accessToken);
      if (projects.length === 0) {
        archive.append(null, { name: `${sanitizedHubName}/` });
        console.log(`No projects found for hub: ${sanitizedHubName}`);
        continue;
      } else {
        for (const project of projects) {
          const sanitizedProjectName = sanitizeName(project.attributes.name);
          const projectContents = await getProjectContents(
            hub.id,
            project.id,
            null,
            accessToken
          );
          for (const content of projectContents) {
            if (content.type === "folders") {
              await backupAllFolderContents(
                hub.id,
                project.id,
                content.id,
                archive,
                `${sanitizedHubName}/${sanitizedProjectName}`,
                accessToken
              );
            } else if (content.type === "items") {
              await backupAllFileContent(
                hub.id,
                project.id,
                content.id,
                archive,
                `${sanitizedHubName}/${sanitizedProjectName}`,
                accessToken
              );
            }
          }
        }
      }
    }
    console.log("archiving");
    archive.finalize();
  } catch (error) {
    console.error("Error during backup data:", error);
  }
};

const backupSpecificData = async (
  req,
  stream,
  accessToken,
  hubId,
  projectId
) => {
  const zip = new JSZip();
  try {
    const hub = (await getHubs(accessToken)).find((h) => h.id === hubId);
    const sanitizedHubName = sanitizeName(hub.attributes.name);
    const project = (await getProjects(hubId, accessToken)).find(
      (p) => p.id === projectId
    );
    const sanitizedProjectName = sanitizeName(project.attributes.name);
    const projectContents = await getProjectContents(
      hubId,
      projectId,
      null,
      accessToken
    );
    for (const content of projectContents) {
      if (content.type === "folders") {
        await backupFolderContents(
          hubId,
          projectId,
          content.id,
          zip,
          sanitizedProjectName,
          accessToken
        );
      } else if (content.type === "items") {
        await withTimeout(
          backupFileContent(
            hubId,
            projectId,
            content.id,
            zip,
            sanitizedProjectName,
            accessToken
          ),
          15000
        );
      }
    }
    // Generate the zip file and pipe to the response
    console.log("zipBuffer");
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    stream.end(zipBuffer);
  } catch (error) {
    console.error("Error during backup specific data:", error);
    stream.destroy(); // End the stream on error
    throw new Error("Failed to backup specific data.");
  }
};

const backupFileContent = async (
  hubId,
  projectId,
  itemId,
  zip,
  projectName,
  accessToken
) => {
  try {
    const itemVersions = await getItemVersions(projectId, itemId, accessToken);
    // Iterate over each version and back it up
    for (const version of itemVersions) {
      const versionName = sanitizeName(version.attributes.displayName);
      const url = version?.relationships?.storage?.meta?.link?.href;
      if (!url) {
        console.error(
          `No download URL found for version of file ${versionName}. Skipping...`
        );
        continue;
      } else {
        const response = await withTimeout(
          downloadFile(url, accessToken),
          15000
        );
        if (!response) {
          console.log(
            `Failed to download file for version of ${versionName}. Skipping...`
          );
          continue;
        }
        // Add each version of the file to the zip archive with a unique name
        zip.file(`${projectName}/${version?.attributes?.name}`, response);
      }
    }
  } catch (error) {
    console.error(`Error backing up file with ID ${itemId}:`, error);
  }
};

const backupFolderContents = async (
  hubId,
  projectId,
  folderId,
  zip,
  basePath,
  accessToken
) => {
  try {
    const folderContents = await withTimeout(
      getProjectContents(hubId, projectId, folderId, accessToken),
      15000
    );
    for (const item of folderContents) {
      const itemName = sanitizeName(item.attributes?.displayName);
      const itemPath = basePath ? `${basePath}/${itemName}` : itemName;
      if (item.type === "folders") {
        await backupFolderContents(
          hubId,
          projectId,
          item.id,
          zip,
          itemPath,
          accessToken
        );
      } else if (item.type === "items") {
        await withTimeout(
          backupFileContent(
            hubId,
            projectId,
            item.id,
            zip,
            itemPath,
            accessToken
          ),
          15000
        );
      }
    }
  } catch (error) {
    console.error("Error backing up folder contents:", error);
  }
};

const getItemVersions = async (projectId, itemId, accessToken) => {
  try {
    const resp = await withTimeout(
      dataManagementClient.getItemVersions(accessToken, projectId, itemId),
      15000
    );
    return resp.data;
  } catch (err) {
    console.log(err);
  }
};

export {
  getAuthorizationUrl,
  getUserProfile,
  getHubs,
  getProjects,
  getProjectContents,
  getItemContents,
  getItemVersions,
  backupData,
  backupSpecificData,
};
