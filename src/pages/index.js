import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from 'next/router';
import InspireTree from "inspire-tree";
import InspireTreeDOM from "inspire-tree-dom";
import "inspire-tree-dom/dist/inspire-tree-light.min.css";

const Home = () => {
  const [token, setToken] = useState(null);
  const [userName, setUserName] = useState(null);
  const [urn, setUrn] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const viewerContainerRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [hubs, setHubs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedHub, setSelectedHub] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [error, setError] = useState(null);
  const [isBackupAllLoading, setIsBackupAllLoading] = useState(false);
  const [isBackupSelectedLoading, setIsBackupSelectedLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Add authentication status state

  useEffect(() => {
    // Check if the user is authenticated by inspecting the cookie or session
    const checkAuthentication = async () => {
      try {
        const res = await fetch('/api/auth/check');
        if (res.ok) {
          setIsAuthenticated(true); // Set authentication status
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuthentication();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const fetchHubs = async () => {
        try {
          const response = await fetch("/api/hubs");
          if (response.ok) {
            const hubsData = await response.json();
            setHubs(hubsData);
          } else {
            console.error("Failed to fetch hubs");
          }
        } catch (err) {
          console.error("Error fetching hubs:", err);
        }
      };

      fetchHubs();
    }
  }, [isAuthenticated]);

  const fetchProjects = async (hubId) => {
    try {
      const response = await fetch(`/api/hubs/${hubId}/projects`);
      if (response.ok) {
        const projectsData = await response.json();
        setProjects(projectsData);
        setSelectedProject(""); // Reset selected project
      } else {
        console.error("Failed to fetch projects");
        setProjects([]); // Ensure projects are cleared on failure
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
      setProjects([]); // Ensure projects are cleared on error
    }
  };

  const handleHubChange = async (event) => {
    const hubId = event.target.value;
    setSelectedHub(hubId);
    setProjects([]); // Clear projects before fetching new ones
    setSelectedProject(""); // Reset selected project

    if (hubId) {
      await fetchProjects(hubId);
    }
  };

  const handleProjectChange = (event) => {
    const projectId = event.target.value;
    console.log("projectId", projectId);

    setSelectedProject(projectId);
  };

  const handleLoginClick = () => {
    window.location.href = "/api/auth/login";
  };

  const handleLogoutClick = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setToken(null);
    setUserName(null);
    if (viewer) {
      setViewer(null);
    }
    setIsAuthenticated(false); // Set authentication status to false
    window.location.reload();
  };

  useEffect(() => {
    const fetchToken = async () => {
      const tokenData = await fetch("/api/auth/token");
      if (tokenData.ok) {
        const access_token = await tokenData.json();
        setToken(access_token.access_token);
      } else {
        setToken(null);
      }
    };
    fetchToken();
  }, []);

  const fetchUserProfile = async () => {
    const getUserName = await fetch("/api/auth/profile");
    if (getUserName.ok) {
      const username = await getUserName.json();
      setUserName(username.name);
    } else {
      setUserName(null);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUserProfile();
    } else {
      setUserName(null);
    }
  }, [token]);

  const getAccessToken = async (callback) => {
    try {
      const resp = await fetch("/api/auth/token");
      if (!resp.ok) throw new Error(await resp.text());
      const { access_token, expires_in } = await resp.json();
      callback(access_token, expires_in);
    } catch (err) {
      console.error("Error fetching access token:", err);
    }
  };

  const initViewer = async (container) => {
    return new Promise((resolve) => {
      Autodesk.Viewing.Initializer(
        { env: "AutodeskProduction", getAccessToken },
        () => {
          const config = { extensions: ["Autodesk.DocumentBrowser"] };
          const viewerInstance = new Autodesk.Viewing.GuiViewer3D(
            container,
            config
          );
          viewerInstance.start();
          viewerInstance.setTheme("light-theme");
          resolve(viewerInstance);
        }
      );
    });
  };

  const loadModel = (viewer, urn) => {
    function onDocumentLoadSuccess(doc) {
      const defaultModel = doc.getRoot().getDefaultGeometry();
      viewer.loadDocumentNode(doc, defaultModel);
    }

    function onDocumentLoadFailure(code, message) {
      console.error("Document load failure:", message);
    }

    Autodesk.Viewing.Document.load(
      "urn:" + urn,
      onDocumentLoadSuccess,
      onDocumentLoadFailure
    );
  };

  const encodedUrn = (urn) => {
    const refinedUrn = btoa(unescape(encodeURIComponent(urn)));
    return refinedUrn;
  };

  useEffect(() => {
    async function initializeViewer() {
      if (viewerContainerRef.current && token) {
        const viewerInstance = await initViewer(viewerContainerRef.current);
        setViewer(viewerInstance);
      }
    }
    if (token) {
      initializeViewer();
    } else if (viewer) {
      viewer.tearDown();
      setViewer(null);
    }
  }, [token]);

  useEffect(() => {
    if (viewer && urn) {
      const convertedUrn = encodedUrn(urn);

      if (convertedUrn) {
        loadModel(viewer, convertedUrn);
      }
    }
  }, [viewer, urn, loadModel]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const onSelectionChanged = useCallback((urn) => {
    setUrn(urn);
  }, []);

  async function getJSON(url) {
    if (token) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(await resp.text());
          return [];
        }
        return await resp.json();
      } catch (err) {
        console.log(err);
        return [];
      }
    }
  }

  const createTreeNode = (id, text, icon, children = false) => {
    return { id, text, children, itree: { icon } };
  };

  const getHubs = async () => {
    const hubs = await getJSON("/api/hubs");
    return hubs.map((hub) =>
      createTreeNode(`hub|${hub.id}`, hub.attributes.name, "icon-hub", true)
    );
  };

  const getProjects = async (hubId) => {
    const projects = await getJSON(`/api/hubs/${hubId}/projects`);
    return projects.map((project) =>
      createTreeNode(
        `project|${hubId}|${project.id}`,
        project.attributes.name,
        "icon-project",
        true
      )
    );
  };

  const getContents = async (hubId, projectId, folderId = null) => {
    const contents = await getJSON(
      `/api/hubs/${hubId}/projects/${projectId}/contents` +
        (folderId ? `?folder_id=${folderId}` : "")
    );
    return contents.map((item) => {
      if (item.type === "folders") {
        return createTreeNode(
          `folder|${hubId}|${projectId}|${item.id}`,
          item.attributes.displayName,
          "icon-my-folder",
          true
        );
      } else {
        return createTreeNode(
          `item|${hubId}|${projectId}|${item.id}`,
          item.attributes.displayName,
          "icon-item",
          true
        );
      }
    });
  };

  const getVersions = async (hubId, projectId, itemId) => {
    const versions = await getJSON(
      `/api/hubs/${hubId}/projects/${projectId}/contents/${itemId}/versions`
    );
    return versions.map((version) =>
      createTreeNode(
        `version|${version.id}`,
        version.attributes.createTime,
        "icon-version"
      )
    );
  };

  useEffect(() => {
    if (token && userName) {
      const tree = new InspireTree({
        data: function (node) {
          if (!node || !node.id) {
            return getHubs();
          } else {
            const tokens = node.id.split("|");
            switch (tokens[0]) {
              case "hub":
                return getProjects(tokens[1]);
              case "project":
                return getContents(tokens[1], tokens[2]);
              case "folder":
                return getContents(tokens[1], tokens[2], tokens[3]);
              case "item":
                return getVersions(tokens[1], tokens[2], tokens[3]);
              default:
                return [];
            }
          }
        },
      });

      tree.on("node.click", (event, node) => {
        event.preventDefault();
        const tokens = node.id.split("|");
        if (tokens[0] === "version") {
          onSelectionChanged(tokens[1]);
        }
      });

      new InspireTreeDOM(tree, { target: "#tree" });
    }
  }, [token, userName]);

  const handlebackupSelected = async() => {
    try {
      let url = "/api/aps/backup"; // Base URL for the backup API
      if (selectedHub && selectedProject) {
        // URL with query parameters for specific backup
        url += `?hub_id=${selectedHub}&project_id=${selectedProject}`;
      }
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Add any necessary headers, such as authorization headers
        },
      });

      if (!response.ok) {
        throw new Error("Backup failed");
      }

      const blob = await response.blob();
      const urlObject = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObject;
      a.download = "backup.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Revoke the blob URL to avoid memory leaks
      window.URL.revokeObjectURL(urlObject);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBackupSelectedLoading(false);
    }
    
  }

  const handleBackupAll = async () => {
    
    setIsBackupAllLoading(true);
    setError(null);

    try {
      let url = "/api/aps/backup"; // Base URL for the backup API
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Add any necessary headers, such as authorization headers
        },
      });

      if (!response.ok) {
        throw new Error("Backup failed");
      }

      const blob = await response.blob();
      const urlObject = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObject;
      a.download = "backup.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Revoke the blob URL to avoid memory leaks
      window.URL.revokeObjectURL(urlObject);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBackupAllLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full justify-center items-center gap-8">
        {/* <button onClick={handleLoginClick}>Login</button> */}
        <div>
          <img
            className="h-24 object-contain"
            src="https://d1nw187rmwcpt3.cloudfront.net/usam_logo-removebg-preview.webp"
            alt="Autodesk Platform Services"
          />
        </div>
        <div>
          <button
            className="border-2 border-neutral-900 rounded-md bg-gray-800 text-white font-semibold xl:text-xl w-full px-24 py-1 flex justify-center lg:text-sm md:text-sm"
            id="login"
            onClick={handleLoginClick}
          >
            Login
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="flex flex-col h-screen overflow-hidden  ">
      {loading && <Spinner />}

      <div className="flex flex-1 h-full sm:hidden xs:hidden md:flex">
        <div className="w-1/4 h-full overflow-y-scroll bg-gray-900 text-white overflow-x-auto">
        <div className="font-semibold text-lg py-3 flex justify-center">HUBS BROWSER</div>
          <div id="tree" className="m-4"></div>
        </div>
        <div className="w-3/4 h-auto relative">
          <div
            ref={viewerContainerRef}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        {/* ================= */}
        <div className="2xl:w-[18%] flex flex-col xl:w-[22%] lg:w-[23%] md:w-[30%]">
          <div className="sm:hidden xs:hidden md:flex xl:w-[95%] xl:mx-auto p-6 flex flex-col justify-start items-center lg:w-[95%] md:w-full md:p-4">
            <img
              className="h-24 object-contain"
              src="https://d1nw187rmwcpt3.cloudfront.net/usam_logo-removebg-preview.webp"
              alt="Autodesk Platform Services"
            />
            <div className="flex w-max">
              {!userName ? (
                <button
                  className="border-2 px-20 border-neutral-900 rounded-md bg-gray-800 text-white font-semibold xl:text-lg w-full lg:text-sm md:text-sm"
                  id="login"
                  onClick={handleLoginClick}
                >
                  Login
                </button>
              ) : (
                <button
                  className="border-2 border-neutral-900 p-1 rounded-md bg-gray-800 text-white font-semibold text-lg w-full lg:text-lg md:text-sm"
                  id="logout"
                  onClick={handleLogoutClick}
                >
                  Logout ({userName})
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col h-full ">
          <div className=" xl:w-[95%] mt-24 xl:mx-auto p-6 flex flex-col justify-center items-center gap-2 lg:w-[95%] md:w-full md:p-4">
            <div className="text-xl font-sans font-semibold xl:text-xl lg:text-lg md:text-lg">
              Backup All
            </div>
            <button
              className="border-2 border-neutral-900 p-1 rounded-md bg-gray-800 text-white font-semibold text-md w-full lg:text-sm md:text-sm"
              onClick={handleBackupAll}
              disabled={isBackupAllLoading}
            >
              {isBackupAllLoading ? "Backing up..." : "DOWNLOAD "}
            </button>
            {error && <p className="error">{error}</p>}
          </div>
          <div className=" xl:w-[95%] mx-auto p-6 flex flex-col justify-start items-center gap-2 lg:w-[95%] md:w-full md:p-4">
            <div className="text-xl font-sans font-semibold xl:text-xl lg:text-lg md:text-lg">
              Backup Selected
            </div>
            <div className="w-full">
              <select
                id="hub-select"
                className="select border-2 border-neutral-900 w-full p-1 rounded-lg lg:font-medium md:text-base md:font-medium"
                value={selectedHub || ""}
                onChange={handleHubChange}
              >
                <option value="" disabled>
                  Select Hub
                </option>
                {hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.attributes.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full">
              {selectedHub && (
                <select
                  id="project-select"
                  className="select border-2 border-neutral-900 w-full p-1 rounded-lg font-medium"
                  value={selectedProject || ""}
                  onChange={handleProjectChange}
                >
                  <option value="" disabled>
                    Select Project
                  </option>
                  {projects.length > 0 ? (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.attributes.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No projects available
                    </option>
                  )}
                </select>
              )}
            </div>
            <button
              className="border-2 border-neutral-900 p-1 rounded-md bg-gray-800 text-white font-medium text-md w-full lg:text-sm md:text-sm"
              onClick={handlebackupSelected}
              disabled={isBackupSelectedLoading}
            >
              {isBackupSelectedLoading ? "Backing up..." : "DOWNLOAD"}
            </button>
          </div>
          </div>
        </div>
      </div>
      {/* ===================== sm xs ========================= */}
      <div className="sm:flex flex-1 h-full md:hidden xs:flex">
        <div className="w-2/3 h-full overflow-y-scroll bg-gray-900 text-white overflow-x-auto">
        <div className="font-semibold text-lg py-3 flex justify-center">HUBS BROWSER</div>
          <div id="tree" className="m-4"></div>
        </div>
        {/* ================= */}
        <div className="2xl:w-[18%] flex flex-col xl:w-[22%] lg:w-[23%] md:w-[30%]">
          <div className="sm:hidden xs:hidden md:flex xl:w-[95%] xl:mx-auto p-6 flex flex-col justify-start items-center lg:w-[95%] md:w-full md:p-4">
            <img
              className="h-24 object-contain"
              src="https://d1nw187rmwcpt3.cloudfront.net/usam_logo-removebg-preview.webp"
              alt="Autodesk Platform Services"
            />
            <div className="flex w-max">
              {!userName ? (
                <button
                  className="border-2 px-20 border-neutral-900 rounded-md bg-gray-800 text-white font-semibold xl:text-lg w-full lg:text-sm md:text-sm"
                  id="login"
                  onClick={handleLoginClick}
                >
                  Login
                </button>
              ) : (
                <button
                  className="border-2 border-neutral-900 p-1 rounded-md bg-gray-800 text-white font-semibold text-lg w-full lg:text-lg md:text-sm"
                  id="logout"
                  onClick={handleLogoutClick}
                >
                  Logout ({userName})
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col h-full ">
          <div className=" xl:w-[95%] mt-24 xl:mx-auto p-6 flex flex-col justify-center items-center gap-2 lg:w-[95%] md:w-full md:p-4">
            <div className="text-xl font-sans font-semibold xl:text-xl lg:text-lg md:text-lg">
              Backup All
            </div>
            <button
              className="border-2 border-neutral-900 p-1 rounded-md bg-gray-800 text-white font-semibold text-md w-full lg:text-sm md:text-sm"
              onClick={handleBackupAll}
              disabled={isBackupAllLoading}
            >
              {isBackupAllLoading ? "Backing up..." : "DOWNLOAD "}
            </button>
            {error && <p className="error">{error}</p>}
          </div>
          <div className=" xl:w-[95%] mx-auto p-6 flex flex-col justify-start items-center gap-2 lg:w-[95%] md:w-full md:p-4">
            <div className="text-xl font-sans font-semibold xl:text-xl lg:text-lg md:text-lg">
              Backup Selected
            </div>
            <div className="w-full">
              <select
                id="hub-select"
                className="select border-2 border-neutral-900 w-full p-1 rounded-lg lg:font-medium md:text-base md:font-medium"
                value={selectedHub || ""}
                onChange={handleHubChange}
              >
                <option value="" disabled>
                  Select Hub
                </option>
                {hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.attributes.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full">
              {selectedHub && (
                <select
                  id="project-select"
                  className="select border-2 border-neutral-900 w-full p-1 rounded-lg font-medium"
                  value={selectedProject || ""}
                  onChange={handleProjectChange}
                >
                  <option value="" disabled>
                    Select Project
                  </option>
                  {projects.length > 0 ? (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.attributes.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No projects available
                    </option>
                  )}
                </select>
              )}
            </div>
            <button
              className="border-2 border-neutral-900 p-1 rounded-md bg-gray-800 text-white font-medium text-md w-full lg:text-sm md:text-sm"
              onClick={handlebackupSelected}
              disabled={isBackupSelectedLoading}
            >
              {isBackupSelectedLoading ? "Backing up..." : "DOWNLOAD"}
            </button>
          </div>
          </div>
        </div>
      </div>
      {/* ======================== sm xs ===================== */}
      
    </div>
  );
};

const Spinner = () => (
  <div
    id="spinner"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
  >
    <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4"></div>
  </div>
);

export default Home;
