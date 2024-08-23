import React, { useEffect, useState, useCallback, useRef } from "react";
import InspireTree from "inspire-tree";
import InspireTreeDOM from "inspire-tree-dom";
import "inspire-tree-dom/dist/inspire-tree-light.min.css";

const Home = () => {
  const [token, setToken] = useState(null);
  const [userName, setUserName] = useState(null);
  const [urn, setUrn] = useState("");
  // const [hubList, setHubList] = useState([])
  // const [projectList, setProjectList] = useState([])
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const viewerContainerRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [hubs, setHubs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedHub, setSelectedHub] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHubs = async () => {
      try {
        const response = await fetch("/api/hubs");
        if (response.ok) {
          const hubsData = await response.json();
          setHubs(hubsData);
          if (hubsData.length > 0) {
            const firstHubId = hubsData[0].id;
            setSelectedHub(firstHubId);
            fetchProjects(firstHubId);
          }
        } else {
          console.error("Failed to fetch hubs");
        }
      } catch (err) {
        console.error("Error fetching hubs:", err);
      }
    };

    fetchHubs();
  }, []);

  const fetchProjects = async (hubId) => {
    try {
      const response = await fetch(`/api/hubs/${hubId}/projects`);
      if (response.ok) {
        const projectsData = await response.json();
        console.log(projectsData);
        
        setProjects(projectsData);
        setSelectedProject(projectsData[0]?.id)
      } else {
        console.error("Failed to fetch projects");
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };
  
  const handleHubChange = (event) => {
    const hubId = event.target.value;
    setSelectedHub(hubId);
    fetchProjects(hubId);
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

  const getAccessToken = useCallback(async (callback) => {
    try {
      const resp = await fetch("/api/auth/token");
      if (!resp.ok) throw new Error(await resp.text());
      const { access_token, expires_in } = await resp.json();
      callback(access_token, expires_in);
    } catch (err) {
      console.error("Error fetching access token:", err);
    }
  }, []);

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
    // const baseUrn = urn.split('?')[0];
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
      viewer.tearDDown();
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
  // console.log(hubList, projectList);

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
      setIsLoading(false);
    }
    
  }

  const handleBackupAll = async () => {
    
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {loading && <Spinner />}
      <div className="flex items-center justify-between h-14 w-full bg-white shadow-md px-4">
        <img
          className="h-8"
          src="https://cdn.autodesk.io/logo/black/stacked.png"
          alt="Autodesk Platform Services"
        />
        <span className="font-bold text-lg">Hubs Browser</span>
        <div className="flex items-center space-x-4">
          {/* <button className="btn">BackUp All</button> */}
          <button
            className="btn"
            onClick={handleBackupAll}
            disabled={isLoading}
          >
            {isLoading ? "Backing up..." : "BackUp All"}
          </button>
          {error && <p className="error">{error}</p>}
          <select
            id="hub-select"
            className="select"
            value={selectedHub}
            onChange={handleHubChange}
          >
            {hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.attributes.name}
              </option>
            ))}
          </select>

          <select id="project-select" className="select" value={selectedProject} onChange={handleProjectChange}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.attributes.name}
              </option>
            ))}
          </select>
          {/* <select id="hub-select" className="select"></select>
          <select id="project-select" className="select"></select> */}
          <button className="btn" onClick={handlebackupSelected}>BackUp Selected</button>
          {!userName ? (
            <button id="login" onClick={handleLoginClick}>
              Login
            </button>
          ) : (
            <button id="logout" onClick={handleLogoutClick}>
              {userName}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 h-full">
        <div className="w-1/4 h-full overflow-y-scroll bg-gray-900 text-white overflow-x-auto">
          <div id="tree" className="m-4"></div>
        </div>
        <div className="w-3/4 h-auto relative">
          <div
            ref={viewerContainerRef}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
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
