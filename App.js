import React, { useState, useEffect, useCallback, useRef } from "react";

import {
  Container,
  Typography,
  TextField,
  Snackbar,
  Alert,
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Chip,
  Divider,
  CircularProgress,
  Tooltip,
  Autocomplete,
  Skeleton,
  Checkbox,
} from "@mui/material";

import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import CloseIcon from "@mui/icons-material/Close";
import GitHubIcon from "@mui/icons-material/GitHub";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import SyncIcon from "@mui/icons-material/Sync";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

const API_URL = process.env.REACT_APP_API_URL;
const deleteBranchApi = async (branchName) => {
  const res = await fetch(`${API_URL}/delete-branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch: branchName }),
  });
  return res.json();
};

const getCurrentBranchApi = async () => {
  const res = await fetch(`${API_URL}/current-branch`);
  if (!res.ok) throw new Error("Failed to get current branch");
  return res.json();
};

const stashChangesApi = async () => {
  const res = await fetch(`${API_URL}/stash`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
};

const CloudPulseLogo = () => (
  <svg width="32" height="35" viewBox="0 0 100 108" xmlns="http://www.w3.org/2000/svg">
    <g fill="#009CDE" fillRule="nonzero">
      <path d="M54.5,104.8 C57,105.6 56.9,107.2 54.1,107.2 C24.3,107.2 0,83.2 0,53.6 C0,24 24.2,0 54.1,0 C56.9,0 57.5,1.5 55.2,2.2 C32.8,8.6 16.4,29.2 16.4,53.6 C16.4,77.7 32.4,98.1 54.5,104.8 M26.6,66.1 C26.5,64.7 26.4,63.2 26.4,61.7 C26.4,38.2 45.5,19.1 69,19.1 C91.2,19.1 97.9,29 98.7,28.4 C99.6,27.7 90.6,8 64.5,8 C41,8 21.9,27.1 21.9,50.6 C21.9,56 22.9,61.2 24.8,66 C25.6,68 26.8,68.1 26.6,66.1 M44.5,35.4 C55.6,30.6 69.5,30.4 83.1,35.2 C92.3,38.4 97.6,43 98,42.8 C98.7,42.5 92.7,32.9 81.7,28.7 C68.4,23.7 54.2,26.3 43.8,34.5 C42.7,35.4 43.1,36 44.5,35.4" />
    </g>
  </svg>
);

const ENV_LABELS = {
  prod: 'Production',
  alpha: 'Alpha',
  staging: 'Staging',
  devCloud: 'Dev Cloud',
}

function App() {
  

  const ENV_OPTIONS = ['prod', 'alpha', 'devCloud', 'staging'];
  const [envSwitcherOpen, setEnvSwitcherOpen] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState('');
  const [envLoading, setEnvLoading] = useState(false);
  const [envMessage, setEnvMessage] = useState('');
  
   const [remotes, setRemotes] = useState([]);
  // State for branches, selection, search and loading
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectionModel, setSelectionModel] = useState([]);
  const [deletingBranches, setDeletingBranches] = useState(new Set());
  const handleCopy = (branchName) => {
    navigator.clipboard.writeText(branchName);
    setSnackbar({ open: true, message: `Copied "${branchName}" to clipboard!`, severity: "success" });
  };
  // Snackbar notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Delete confirmations
  const [confirmDelete, setConfirmDelete] = useState({ open: false, branchName: "" });
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] = useState(false);

  // Current branch display
  const [currentBranch, setCurrentBranch] = useState("");

  // Stash loading
  const [isStashing, setIsStashing] = useState(false);

  // Pull loading & force pull confirm
  const [isPulling, setIsPulling] = useState(false);
  const [forcePullConfirmOpen, setForcePullConfirmOpen] = useState(false);

  // Automation dialog
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [autoStartServer, setAutoStartServer] = useState(true);
  const [automationSpec, setAutomationSpec] = useState("");

  // Create Branch dialog and form state
  const [createBranchDialogOpen, setCreateBranchDialogOpen] = useState(false);
  const [createBranchRemote, setCreateBranchRemote] = useState("");
  const [createBranchTarget, setCreateBranchTarget] = useState("");
  const [createBranchName, setCreateBranchName] = useState("");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [remoteBranchList, setRemoteBranchList] = useState([]);
  const [remoteBranchesLoading, setRemoteBranchesLoading] = useState(false);

  // Checkout Branch dialog
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [checkoutBranchName, setCheckoutBranchName] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Stats dialog state and data
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState([]);
  const [statsError, setStatsError] = useState("");
  const [statsBranch, setStatsBranch] = useState("");

  // Suggestions cache and abort
  const [suggestions, setSuggestions] = useState([]);
  const suggestionsCacheRef = useRef({});
  const abortControllerRef = useRef(null);
  const [specList, setSpecList] = useState([]);
  const [checkedSpecs, setCheckedSpecs] = useState([]);
  const [specLoading, setSpecLoading] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [lastEnvKey, setLastEnvKey] = useState(() => localStorage.getItem('lastEnvKey') || '');
  const [pageSize, setPageSize] = useState(10); // Default page size




  // Debounce utility
  const debounce = (func, delay) => {
    let timer;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => func(...args), delay);
    };
  };

  // Fetch suggestions for autocomplete with abort & cache
  const fetchSuggestions = async (input) => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    if (suggestionsCacheRef.current[input]) {
      setSuggestions(suggestionsCacheRef.current[input]);
      return;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch(
        `${API_URL}/search-branches?q=${encodeURIComponent(input.trim())}&limit=10`,
        { signal: abortControllerRef.current.signal }
      );
      if (res.ok) {
        const data = await res.json();
        const names = data.map((b) => b.name);
        suggestionsCacheRef.current[input] = names;
        setSuggestions(names);
      } else {
        setSuggestions([]);
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setSuggestions([]);
    }
  };

  // Debounced fetching for suggestions
  const debouncedFetchSuggestions = useCallback(debounce(fetchSuggestions, 400), []);

useEffect(() => {
  document.title = "Git Dashboard";
}, []);
    
  useEffect(() => {
    debouncedFetchSuggestions(search);
  }, [search, debouncedFetchSuggestions]);

  useEffect(() => {
    if (automationDialogOpen) {
      setSpecLoading(true);
      fetch(`${API_URL}/list-specs`)
        .then(res => res.json())
        .then(data => {
          console.log("Spec API data:", data); // ← ADD THIS LINE!
          setSpecList(Array.isArray(data) ? data : []);
          setCheckedSpecs([]);
          setSelectAll(false);
        })
        .catch(() => {
          setSpecList([]);
          setCheckedSpecs([]);
          setSelectAll(false);
        })
        .finally(() => setSpecLoading(false));
    }
  }, [automationDialogOpen]);
  
  
  
  
  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/remotes`)
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched remotes:", data.remotes);
        if (active && data.remotes) setRemotes(data.remotes);
      })
      .catch((e) => {
        setRemotes([]);
        console.error("Error fetching remotes:", e);
      });
    return () => { active = false; };
  }, []);
  
  // Fetch branches list
  useEffect(() => {
    let active = true;
    const url = query
      ? `${API_URL}/search-branches?q=${encodeURIComponent(query)}`
      : `${API_URL}/branches`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setBranches(
          (data || []).map((row) => ({
            ...row,
            id: row.name,
            name: row.name ?? "",
            date: row.date ?? "",
            createdAt: row.createdAt ?? "",
          }))
        );
      })
      .catch(() => {
        if (!active) return;
        setSnackbar({ open: true, message: "Failed to fetch branches.", severity: "error" });
      });
    return () => { active = false; };
  }, [query]);

  // Fetch current branch initially
  useEffect(() => {
    let active = true;
    getCurrentBranchApi()
      .then((data) => {
        if (active && data.branch) setCurrentBranch(data.branch);
      })
      .catch((e) => console.error("Failed to fetch current branch", e));
    return () => { active = false; };
  }, []);

  // Fetch remote branches for create branch form
  useEffect(() => {
    if (!createBranchRemote || ["aclp", "linode"].includes(createBranchRemote)) {
      setRemoteBranchList([]);
      return;
    }
    setRemoteBranchesLoading(true);
    fetch(`${API_URL}/remote-branches?remote=${encodeURIComponent(createBranchRemote)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setRemoteBranchList)
      .catch(() => setRemoteBranchList([]))
      .finally(() => setRemoteBranchesLoading(false));
  }, [createBranchRemote]);

  const handleOpenEnvSwitcher = () => {
    setEnvMessage('');
    //setSelectedEnv('');
    setEnvSwitcherOpen(true);
  };
  
  const handleCloseEnvSwitcher = () => {
    setEnvSwitcherOpen(false);
    setEnvMessage('');
    setSelectedEnv('');
  };
  
  const handleConfirmEnvSwitch = async () => {
    if (!selectedEnv || !ENV_OPTIONS.includes(selectedEnv)) {
      setEnvMessage('Please select a valid environment.');
      return;
    }
    setEnvLoading(true);
    setEnvMessage('');
    try {
      const resp = await fetch(`${API_URL}/env?env=${selectedEnv}`);
      const data = await resp.json();
  
      if (!resp.ok) {
        throw new Error(data.error || resp.statusText || 'Switch failed');
      }
  
      setEnvMessage(`Switched to: ${data.envKey || selectedEnv}`);
      setLastEnvKey(data.envKey || selectedEnv);             // <--- ADD HERE
      localStorage.setItem('lastEnvKey', data.envKey || selectedEnv); // <--- ADD HERE
      setEnvSwitcherOpen(false);
    } catch (e) {
      setEnvMessage(`Failed: ${e.message}`);
    } finally {
      setEnvLoading(false);
    }
  };
  

  // Handle single branch delete prompt
  const handlePromptDelete = (branchName) => setConfirmDelete({ open: true, branchName });

  // Confirm single branch delete
  const handleConfirmDelete = async () => {
    const branchName = confirmDelete.branchName;
    setConfirmDelete({ open: false, branchName: "" });
    if (branchName === currentBranch) {
      setSnackbar({
        open: true,
        message: `Cannot delete current branch "${branchName}". Switch branch first.`,
        severity: "error",
      });
      return;
    }
    setDeletingBranches((prev) => new Set(prev).add(branchName));
    try {
      const result = await deleteBranchApi(branchName);
      if (result.success) {
        setSnackbar({ open: true, message: `Branch "${branchName}" deleted.`, severity: "success" });
        setBranches((prev) => prev.filter((b) => b.name !== branchName));
        setSelectionModel((prev) => (Array.isArray(prev) ? prev.filter((b) => b !== branchName) : []));
      } else {
        setSnackbar({ open: true, message: result.error || "Delete failed.", severity: "error" });
      }
    } catch {
      setSnackbar({ open: true, message: "Delete failed.", severity: "error" });
    }
    setDeletingBranches((prev) => {
      const newSet = new Set(prev);
      newSet.delete(branchName);
      return newSet;
    });
  };

  // Prompt delete selected branches dialog
  const handlePromptDeleteSelected = () => {
    if (selectionModel.length) setConfirmDeleteSelectedOpen(true);
  };

  // Confirm delete selected branches
  const handleConfirmDeleteSelected = async () => {
    setConfirmDeleteSelectedOpen(false);
    if (!selectionModel.length) return;

    setDeletingBranches((prev) => {
      const newSet = new Set(prev);
      selectionModel.forEach((b) => newSet.add(b));
      return newSet;
    });

    const failed = [];
    for (const branch of selectionModel) {
      try {
        const result = await deleteBranchApi(branch);
        if (!result.success) failed.push(branch);
      } catch {
        failed.push(branch);
      }
      setDeletingBranches((prev) => {
        const newSet = new Set(prev);
        newSet.delete(branch);
        return newSet;
      });
    }
    setSnackbar({
      open: true,
      message: failed.length === 0
        ? `Deleted ${selectionModel.length} selected branch${selectionModel.length > 1 ? "es" : ""} successfully.`
        : `Some deletions failed: ${failed.join(", ")}`,
      severity: failed.length === 0 ? "success" : "error",
    });
    setBranches((prev) => prev.filter((b) => !selectionModel.includes(b.name)));
    setSelectionModel([]);
  };

  // Stash handler
  const handleStashChanges = async () => {
    setIsStashing(true);
    setSnackbar({ open: false, message: "", severity: "info" });
    try {
      const data = await stashChangesApi();
      if (data.success) {
        setSnackbar({ open: true, message: data.message ?? "Stash successful.", severity: "success" });
        if (data.branch) setCurrentBranch(data.branch);
      } else {
        setSnackbar({ open: true, message: data.message ?? "Stash failed.", severity: "error" });
      }
    } catch (e) {
      setSnackbar({ open: true, message: String(e.message), severity: "error" });
    }
    setIsStashing(false);
  };

  // Pull with force option
  const handlePull = async () => {
    setIsPulling(true);
    setSnackbar({ open: false, message: "", severity: "info" });
    try {
      const resp = await fetch(`${API_URL}/pull-and-pnpm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await resp.json();
      if (!resp.ok && data.error && data.error.includes("uncommitted changes")) {
        setForcePullConfirmOpen(true);
      } else if (!resp.ok) {
        setSnackbar({ open: true, message: data.error || "Pull failed", severity: "error" });
      } else {
        setSnackbar({ open: true, message: data.message, severity: "success" });
        setQuery(""); // Refresh branches
      }
    } catch (err) {
      setSnackbar({ open: true, message: String(err.message), severity: "error" });
    }
    setIsPulling(false);
  };
  // Force pull ignoring uncommitted changes
  const forcePull = async () => {
    setForcePullConfirmOpen(false);
    setIsPulling(true);
    try {
      const resp = await fetch(`${API_URL}/pull-and-pnpm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setSnackbar({ open: true, message: data.error || "Pull failed", severity: "error" });
      } else {
        setSnackbar({ open: true, message: data.message, severity: "success" });
        setQuery(""); // Refresh branches
      }
    } catch (err) {
      setSnackbar({ open: true, message: String(err.message), severity: "error" });
    }
    setIsPulling(false);
  };

//start service
  const handleStartService = async () => {
    try {
      // Example: Replace with your real API endpoint
      const resp = await fetch(`${API_URL}/start-service`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      if (data.success) {
        setSnackbar({ open: true, message: data.message || "Service started.", severity: "success" });
      } else {
        setSnackbar({ open: true, message: data.error || "Failed to start service.", severity: "error" });
      }
    } catch (e) {
      setSnackbar({ open: true, message: "Failed to start service.", severity: "error" });
    }
  };
  

  // Create new branch handler
  const handleCreateBranch = async () => {
    setIsSubmittingCreate(true);
    try {
      const resp = await fetch(`${API_URL}/create-branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteRepo: createBranchRemote,
          targetBranch: createBranchTarget,
          branchName: createBranchName,
        }),
      });
      const data = await resp.json();
  
      if (resp.ok && data.success) {
        setSnackbar({ open: true, message: `Branch created: ${data.branch}`, severity: "success" });
        setCreateBranchDialogOpen(false);
  
        // Explicitly fetch updated branches from ${API_URL}/branches:
        const branchesResp = await fetch(`${API_URL}/branches`);
        if (branchesResp.ok) {
          const branchesData = await branchesResp.json();
          setBranches(
            (branchesData || []).map((row) => ({
              ...row,
              id: row.name,
              name: row.name ?? "",
              date: row.date ?? "",
              createdAt: row.createdAt ?? "",
            }))
          );
        } else {
          setSnackbar({ open: true, message: "Failed to refresh branches after creation.", severity: "error" });
        }
      } else {
        throw new Error(data.error || "Failed to create branch");
      }
    } catch (e) {
      setSnackbar({ open: true, message: String(e.message), severity: "error" });
    }
    setIsSubmittingCreate(false);
  };
  
  

  // Checkout branch handler
  const handleCheckoutBranch = async () => {
    if (!checkoutBranchName.trim()) return;
    setIsCheckingOut(true);
    try {
      const resp = await fetch(`${API_URL}/checkout-branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: checkoutBranchName.trim() }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setSnackbar({ open: true, message: data.message, severity: "success" });
        setCheckoutDialogOpen(false);
        // Refresh current branch
        const current = await getCurrentBranchApi();
        if (current.branch) setCurrentBranch(current.branch);
      } else {
        throw new Error(data.error || "Checkout failed");
      }
    } catch (e) {
      setSnackbar({ open: true, message: String(e.message), severity: "error" });
    }
    setIsCheckingOut(false);
  };

  // Function to show stats dialog by calling stats API
  const handleShowStats = async (branchName) => {
    setStatsOpen(true);
    setStatsLoading(true);
    setStatsError("");
    setStatsData([]);
    setStatsBranch(branchName);
    try {
      const res = await fetch(`${API_URL}/ts-file-stats?branch=${encodeURIComponent(branchName)}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setStatsError("No stats are available.");
        setStatsData([]);
      } else {
        setStatsData(data);
        setStatsError("");
      }
    } catch {
      setStatsError("Failed to fetch stats.");
      setStatsData([]);
    } 
    setStatsLoading(false);
  };

  // Loading skeleton for table
  const LoadingOverlay = () => (
    <Box sx={{ p: 2 }}>
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1, borderRadius: 1 }} animation="wave" />
      ))}
    </Box>
  );

  // Columns including branch name clickable for stats, and delete icon
  const columns = [
    {
      field: "name",
      headerName: "Branch Name",
      flex: 1,
      minWidth: 250,
      renderHeader: () => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <GitHubIcon sx={{ color: "#0ea5e9" }} />
          <span>Branch Name</span>
        </Box>
      ),
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title="Copy & show .ts files stats" arrow>
            <span
              style={{
                fontWeight: 500,
                color: "#0ea5e9",
                backgroundColor: "#ecfeff",
                borderRadius: "14px",
                padding: "7px 20px",
                fontSize: "16px",
                cursor: "pointer",
                border: "1.5px solid #0ea5e9",
                transition: "background 0.1s,border 0.1s,color 0.1s",
                boxShadow: "0 1px 6px 0 #dbeafe",
                userSelect: "text",
              }}
              onClick={() => {
                handleCopy(params.value);
                handleShowStats(params.value);
              }}
            >
              {params.value}
            </span>
          </Tooltip>
          <IconButton size="small" onClick={() => handleCopy(params.value)} aria-label="Copy branch name">
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
    
    {
      field: "date",
      headerName: "Branch Date",
      flex: 1,
      minWidth: 210,
      renderHeader: () => <span>Branch Creation Date</span>,
    },
   /* {
      field: "createdAt",
      headerName: "Creation Date",
      flex: 1,
      minWidth: 210,
      renderHeader: () => <span>Creation Date</span>,
    },*/
    {
      field: "createdFrom",  // <-- New column
      headerName: "Created From",
      flex: 1,
      minWidth: 230,
      renderHeader: () => <span>Created From</span>,
      renderCell: (params) => (
        <span style={{ color: "#2d3748", fontWeight: 600 }}>
          {params.value || "-"}
        </span>
      ),
    },
    {
      field: "actions",
      renderHeader: () => (
        <span style={{ fontWeight: 700, display: "flex", alignItems: "center" }}>
          Actions
          <IconButton
            size="small"
            color="error"
            title="Delete Selected"
            disabled={selectionModel.length === 0 || deletingBranches.size > 0}
            onClick={handlePromptDeleteSelected}
            sx={{ ml: 1 }}
          >
            <DeleteSweepIcon />
          </IconButton>
        </span>
      ),
      type: "actions",
      minWidth: 140,
      getActions: (params) => {
        const isDeleting = deletingBranches.has(params.row.name);
        return isDeleting
          ? [
              <GridActionsCellItem icon={<CircularProgress size={20} />} label="Deleting" disabled key="loading" />,
            ]
          : [
              <GridActionsCellItem
                icon={<DeleteIcon color="error" />}
                label="Delete"
                disabled={deletingBranches.size > 0}
                onClick={() => handlePromptDelete(params.row.name)}
                key="delete"
              />,
            ];
      },
    },
  ];

  return (
    
    <Container 
    
    
    maxWidth={false}
  disableGutters
  sx={{
    mt: 4,
    mb: 4,
    width: '75vw',         // almost the whole viewport
    maxWidth: 'none',      // fully overrides MUI's default
  }}>
    <Box
  sx={{
    display: "flex",
    alignItems: "center",
    gap: 2,           // Adds space between icon and text (optional)
    mb: 2             // Margin below header (optional)
  }}
>
</Box>
      <Paper
        elevation={8}
        sx={{
          p: { xs: 2, md: 4 },
          bgcolor: "#f9fafb",
          borderRadius: 4,
          boxShadow: "0 2px 18px 1px #e5e7eb",
        }}
      >        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: 3,
            borderBottom: "2.5px solid #0ea5e9",
            pb: 2,
            justifyContent: "space-between",
          }}
        >
      <Box sx={{ display: "flex", alignItems: "center" }}>
  <CloudPulseLogo />
  <Typography
    variant="h4"
    sx={{
      fontWeight: 800,
      ml: 1,
      background: "linear-gradient(90deg,#0ea5e9,#2563eb,#f43f5e)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      whiteSpace: "nowrap"
    }}
  >
    Git Dashboard
    
  </Typography>
</Box>


          {/* Action Buttons */}
          <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 } }}>
            
            <Button
              variant="contained"
              size="small"
         startIcon={<AddIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                fontSize: 16,
                borderRadius: 3,
                px: 2.5,
                py: 1.25,
                background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
                color: "#fff",
                boxShadow: "0 4px 20px #f43f5e50",     // <-- Stronger, colored shadow
                "&:hover": {
                  background: "linear-gradient(90deg, #2563eb 80%, #f43f5e 100%)",
                  border: "3px solid #0ea5e9",
                  boxShadow: "0 6px 32px #0ea5e980",
                },
                // Subtle glow for further pop
                boxSizing: "border-box",
              }}
              onClick={() => {
                setCreateBranchDialogOpen(true);
                setCreateBranchRemote("");
                setCreateBranchTarget("");
                setCreateBranchName("");
              }}
            >
              Create
            </Button>

            <Button
              variant="contained"
              size="small"
             disabled={isPulling}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                fontSize: 16,
                borderRadius: 3,
                px: 2.5,
                py: 1.25,
                background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
                color: "#fff",
                boxShadow: "0 4px 20px #f43f5e50",     // <-- Stronger, colored shadow
                "&:hover": {
                  background: "linear-gradient(90deg, #2563eb 80%, #f43f5e 100%)",
                  border: "3px solid #0ea5e9",
                  boxShadow: "0 6px 32px #0ea5e980",
                },
                // Subtle glow for further pop
                boxSizing: "border-box",
              }}
              startIcon={isPulling ? <CircularProgress color="inherit" size={16} /> : <SyncIcon />}
              onClick={handlePull}
            >
              {isPulling ? "Pulling..." : "Pull"}
            </Button>

            <Button
              variant="contained"
              disabled={isStashing}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                fontSize: 16,
                borderRadius: 3,
                px: 2.5,
                py: 1.25,
                background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
                color: "#fff",
                boxShadow: "0 4px 20px #f43f5e50",     // <-- Stronger, colored shadow
                "&:hover": {
                  background: "linear-gradient(90deg, #2563eb 80%, #f43f5e 100%)",
                  border: "3px solid #0ea5e9",
                  boxShadow: "0 6px 32px #0ea5e980",
                },
                // Subtle glow for further pop
                boxSizing: "border-box",
              }}
              startIcon={isStashing ? <CircularProgress color="inherit" size={16} /> : null}
              onClick={handleStashChanges}
            >
              {isStashing ? "Stashing..." : "Stash"}
            </Button>
            <Tooltip
  title={
    lastEnvKey && ENV_LABELS[lastEnvKey]
      ? `You are in ${ENV_LABELS[lastEnvKey]}`
      : "Switch environment"
  }
  arrow
  placement="bottom"
  componentsProps={{
    tooltip: {
      sx: {
        background: "linear-gradient(90deg, #0ea5e9 80%, #38bdf8 100%)", // blue gradient background
        color: "#fff",                // white text
        fontWeight: 700,              // bold
        fontSize: "15px",
        borderRadius: 1.5,
        boxShadow: "0 3px 16px #0ea5e9cc",
        px: 2.2,
        py: 1.15,
      }
    },
    arrow: {
      sx: {
        color: "#0ea5e9"
      }
    }
  }}
>
  <div style={{ display: "inline-block" }}>
    <Button
      variant="contained"
      sx={{
        textTransform: "none",
        fontWeight: 700,
        fontSize: 16,
        borderRadius: 3,
        px: 2.5,
        py: 1.25,
        background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
        color: "#fff",
        boxShadow: "0 4px 20px #f43f5e50",
        "&:hover": {
          background: "linear-gradient(90deg, #2563eb 80%, #0ea5e9 100%)",
          border: "3px solid #0ea5e9",
          boxShadow: "0 6px 32px #0ea5e980",
        },
        boxSizing: "border-box",
      }}
      onClick={handleOpenEnvSwitcher}
    >
      Switch Environment
    </Button>
  </div>
</Tooltip>


<Button
      variant="contained"
   startIcon={<SettingsInputComponentIcon />} // Or choose another icon if desired
   sx={{
    textTransform: "none",
    fontWeight: 700,
    fontSize: 16,
    borderRadius: 3,
    px: 2.5,
    py: 1.25,
    background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
    color: "#fff",
    boxShadow: "0 4px 20px #f43f5e50",     // <-- Stronger, colored shadow
    "&:hover": {
      background: "linear-gradient(90deg, #2563eb 80%, #f43f5e 100%)",
      boxShadow: "0 6px 32px #0ea5e980",
    },
    // Subtle glow for further pop
    boxSizing: "border-box",
  }}
  onClick={handleStartService} // Function defined below
>
  Start
</Button>
<Button
  variant="contained"
  color="primary"
  startIcon={<SettingsInputComponentIcon />}
  sx={{
    textTransform: "none",
    fontWeight: 700,
    fontSize: 16,
    borderRadius: 3,
    px: 2.5,
    py: 1.25,
    background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
    color: "#fff",
    boxShadow: "0 4px 20px #f43f5e50",
    "&:hover": {
      background: "linear-gradient(90deg, #2563eb 80%, #f43f5e 100%)",
      boxShadow: "0 6px 32px #0ea5e980"
    },
    boxSizing: "border-box"
  }}
  onClick={() => setAutomationDialogOpen(true)}
>
  Run Automation
</Button>

            <Button
              variant="contained"
              color="secondary"
              sx={{
                textTransform: "none",
                fontWeight: 700,
                fontSize: 16,
                borderRadius: 3,
                px: 2.5,
                py: 1.25,
                background: "linear-gradient(90deg, #0ea5e9 90%, #38bdf8 100%)",
                color: "#fff",
                boxShadow: "0 4px 20px #f43f5e50",     // <-- Stronger, colored shadow
                "&:hover": {
                  background: "linear-gradient(90deg, #2563eb 80%, #f43f5e 100%)",
                  border: "3px solid #0ea5e9",
                  boxShadow: "0 6px 32px #0ea5e980",
                },
                // Subtle glow for further pop
                boxSizing: "border-box",
              }}
              onClick={() => {
                setCheckoutBranchName("");
                setCheckoutDialogOpen(true);
              }}
            >
              Checkout
            </Button>
          </Box>
        </Box>
        <Dialog
  open={automationDialogOpen}
  onClose={() => setAutomationDialogOpen(false)}
  maxWidth="sm"
  fullWidth
  PaperProps={{
    sx: {
      bgcolor: "#fcfeff",
      borderRadius: 4,
      border: "3px solid #38bdf8",
      boxShadow: "0 8px 36px #94a3b840",
      minWidth: { xs: "95vw", sm: 540 },
      p: 1,
    }
  }}
>
  <DialogTitle
    sx={{
      fontWeight: 800,
      color: "#0ea5e9",
      fontSize: 22,
      letterSpacing: 1,
      borderRadius: "14px 14px 0 0",
      bgcolor: "#e0f2fe",
      borderBottom: "2px solid #38bdf8",
      display: "flex",
      alignItems: "center"
    }}
  >
    Run Cypress Automation
    <IconButton sx={{ ml: "auto" }} onClick={() => setAutomationDialogOpen(false)} aria-label="close">
      <CloseIcon />
    </IconButton>
  </DialogTitle>
  <DialogContent sx={{ py: 2 }}>
  {specLoading ? (
    <Box textAlign="center" py={4}>
      <CircularProgress />
    </Box>
  ) : specList.length === 0 ? (
    <Typography>No specs found.</Typography>
  ) : (
    <>
      <Box display="flex" alignItems="center" mb={2}>
        <Checkbox
          checked={selectAll}
          indeterminate={checkedSpecs.length > 0 && checkedSpecs.length < specList.length}
          onChange={e => {
            setSelectAll(e.target.checked);
            setCheckedSpecs(e.target.checked ? [...specList] : []);
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Select All</Typography>
      </Box>
      <Box sx={{ overflowY: 'auto', pr: 2 }}>
        {specList.map(spec => (
          <Box key={spec} display="flex" alignItems="center" py={0.2}>
            <Checkbox
              checked={checkedSpecs.includes(spec)}
              onChange={() => {
                let newChecked;
                if (checkedSpecs.includes(spec)) {
                  newChecked = checkedSpecs.filter(s => s !== spec);
                  setSelectAll(false);
                } else {
                  newChecked = [...checkedSpecs, spec];
                  if (newChecked.length === specList.length) setSelectAll(true);
                }
                setCheckedSpecs(newChecked);
              }}
            />
            <Typography variant="body2" sx={{ fontFamily: "monospace", color: "#0ea5e9", fontWeight: 600 }}>
              {spec.split('/').pop()}
            </Typography>
          </Box>
        ))}
      </Box>
    </>
  )}
</DialogContent>


  <DialogActions sx={{ borderTop: "1px solid #e0e7ef", bgcolor: "#f1f8ff" }}>
    <Button onClick={() => setAutomationDialogOpen(false)}>Cancel</Button>
    <Button
      variant="contained"
      color="primary"
      disabled={checkedSpecs.length === 0}
      onClick={() => {
        fetch(`${API_URL}/run-automation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specPaths: checkedSpecs }),
        })
          .then(res => res.json())
          .then(data =>
            setSnackbar({
              open: true,
              message: data.message || 'Automation started.',
              severity: data.success ? 'success' : 'error',
            })
          );
        setAutomationDialogOpen(false);
        setCheckedSpecs([]);
        setSelectAll(false);
      }}
    >
      Run Selected {checkedSpecs.length > 0 ? `(${checkedSpecs.length})` : ""}
    </Button>
  </DialogActions>
</Dialog>


        {/* Create Branch Dialog */}
        <Dialog open={createBranchDialogOpen} onClose={() => setCreateBranchDialogOpen(false)} maxWidth="xs" fullWidth>
       


          <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
            Create New Branch
            <IconButton sx={{ ml: "auto" }} onClick={() => setCreateBranchDialogOpen(false)} aria-label="close">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Autocomplete
              options={remotes}
              value={createBranchRemote}
              onChange={(_, val) => {
                setCreateBranchRemote(val ?? "");
                setCreateBranchTarget("");
              }}
              renderInput={(params) => <TextField {...params} label="Remote Repo" fullWidth margin="dense" />}
              freeSolo={false}
            />

            {/* Target Branch input / autocomplete */}
            {createBranchRemote === "" ? (
              <TextField label="Target Branch" fullWidth margin="dense" disabled value="" helperText="Select a remote first" />
            ) : createBranchRemote === "aclp" ? (
              <Autocomplete
                freeSolo
                options={["aclp_develop"]}
                value={createBranchTarget}
                onChange={(_, val) => setCreateBranchTarget(val ?? "")}
                onInputChange={(_, val) => setCreateBranchTarget(val)}
                renderInput={(params) => (
                  <TextField {...params} label="Target Branch" fullWidth margin="dense" helperText="Autocomplete: aclp_develop" />
                )}
              />
            ) : createBranchRemote === "linode" ? (
              <Autocomplete
                freeSolo
                options={[ "develop", "staging"]}
                value={createBranchTarget}
                onChange={(_, val) => setCreateBranchTarget(val ?? "")}
                onInputChange={(_, val) => setCreateBranchTarget(val)}
                renderInput={(params) => (
                  <TextField {...params} label="Target Branch" fullWidth margin="dense" helperText="Autocomplete: de, develop, staging" />
                )}
              />
            ) : (
              <TextField
                label="Target Branch"
                fullWidth
                margin="dense"
                value={createBranchTarget}
                onChange={(e) => setCreateBranchTarget(e.target.value)}
                helperText="Enter target branch"
                autoComplete="off"
                spellCheck={false}
              />
            )}

            <TextField
              label="New Branch Name"
              fullWidth
              margin="dense"
              value={createBranchName}
              onChange={(e) => setCreateBranchName(e.target.value)}
              helperText="Short descriptive name (no spaces)"
            />

            <Box sx={{ mt: 2, color: "#6b7280", fontSize: 14 }}>
              <strong>Will Create:</strong>{" "}
              <span
                style={{
                  background: "linear-gradient(90deg,#0ea5e9,#2563eb,#f43f5e)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontWeight: 700,
                }}
              >
                {createBranchName && createBranchRemote
                  ? `${createBranchName}_${createBranchRemote}_${new Date().toLocaleString("en-US", {
                      month: "long",
                    })}_${String(new Date().getDate()).padStart(2, "0")}`
                  : <i>Complete form above</i>}
              </span>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button
              variant="contained"
              color="primary"
              disabled={!createBranchRemote || !createBranchTarget || !createBranchName || isSubmittingCreate}
              onClick={handleCreateBranch}
              startIcon={isSubmittingCreate ? <CircularProgress color="inherit" size={18} /> : <AddIcon />}
            >
              {isSubmittingCreate ? "Creating..." : "Create Branch"}
            </Button>
            <Button onClick={() => setCreateBranchDialogOpen(false)}>Cancel</Button>
          </DialogActions>
        </Dialog>

        {/* Force Pull Confirm Dialog */}
        <Dialog open={forcePullConfirmOpen} onClose={() => setForcePullConfirmOpen(false)}>
          <DialogTitle>Uncommitted Changes Detected</DialogTitle>
          <DialogContent>
            <Typography color="error" sx={{ fontWeight: 700 }}>
              ⚠ You have uncommitted local changes.
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Please commit or stash your changes before pulling, or force pull (this will <b>discard ALL uncommitted changes</b>).
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button color="error" onClick={forcePull}>
              Force Pull (Discard All Local)
            </Button>
            <Button onClick={() => setForcePullConfirmOpen(false)}>Cancel</Button>
          </DialogActions>
        </Dialog>        

        {/* Checkout Branch Dialog */}
        <Dialog open={checkoutDialogOpen} onClose={() => setCheckoutDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>
            Checkout Branch
            <IconButton sx={{ ml: "auto" }} onClick={() => setCheckoutDialogOpen(false)} aria-label="close">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <TextField
              label="Branch Name"
              fullWidth
              margin="dense"
              value={checkoutBranchName}
              onChange={(e) => setCheckoutBranchName(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              helperText="Enter the branch name to checkout"
              disabled={isCheckingOut}
              autoFocus
            />
          </DialogContent>

          <DialogActions>
            <Button onClick={() => setCheckoutDialogOpen(false)} disabled={isCheckingOut}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={!checkoutBranchName.trim() || isCheckingOut}
              onClick={handleCheckoutBranch}
              startIcon={isCheckingOut ? <CircularProgress color="inherit" size={18} /> : null}
            >
              {isCheckingOut ? "Checking out..." : "Checkout"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={envSwitcherOpen} onClose={handleCloseEnvSwitcher} maxWidth="xs" fullWidth>
  <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
    Switch Environment
    <IconButton sx={{ ml: "auto" }} onClick={handleCloseEnvSwitcher} aria-label="close">
      <CloseIcon />
    </IconButton>
  </DialogTitle>
  <DialogContent dividers>
    <Autocomplete
      options={ENV_OPTIONS}
      value={selectedEnv}
      onChange={(_, value) => setSelectedEnv(value)}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Environment"
          fullWidth
          margin="dense"
          autoFocus
        />
      )}
    />
    {envMessage && (
      <Alert severity="error" sx={{ mt: 2 }}>
        {envMessage}
      </Alert>
    )}
  </DialogContent>
  <DialogActions>
    <Button onClick={handleCloseEnvSwitcher} disabled={envLoading}>
      Cancel
    </Button>
    <Button
      variant="contained"
      color="primary"
      disabled={!selectedEnv || envLoading}
      onClick={handleConfirmEnvSwitch}
      startIcon={envLoading ? <CircularProgress color="inherit" size={18} /> : null}
    >
      {envLoading ? "Switching..." : "Confirm"}
    </Button>
  </DialogActions>
</Dialog>


        {/* Search Box */}
        <Box
          sx={{
            my: 3,
            mb: 4,
            display: "flex",
            alignItems: "center",
            gap: 1,
            boxShadow: "0 2px 8px rgb(14 165 233 / 0.2)",
            borderRadius: 3,
            bgcolor: "#f0f9ff",
            p: 1.5,
            maxWidth: { xs: "100%", sm: 440 },
          }}
        >
          <SearchIcon sx={{ color: "#0ea5e9", ml: 1 }} />
          <Autocomplete
            freeSolo
            disableClearable
            options={suggestions}
            inputValue={search}
            onInputChange={(event, newInputValue) => {
              setSearch(newInputValue);
              if (newInputValue === "") setQuery("");
            }}
            onChange={(event, newValue) => {
              if (newValue !== null) {
                setQuery(newValue);
                setSearch(newValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                setQuery(search.trim());
              }
            }}
            disabled={deletingBranches.size > 0}
            loading={deletingBranches.size > 0}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search branches"
                size="medium"
                variant="outlined"
                InputProps={{
                  ...params.InputProps,
                  type: "search",
                  style: { fontSize: 16 },
                  endAdornment: (
                    <>
                      {deletingBranches.size > 0 && <CircularProgress color="inherit" size={20} />}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
                helperText="Type to see suggestions, Press Enter to search"
                sx={{
                  width: "100%",
                  "& .MuiInputLabel-root": { fontWeight: 600, color: "#0ea5e9" },
                  "& .MuiOutlinedInput-root": { borderRadius: 3, backgroundColor: "#fff" },
                  "& .MuiFormHelperText-root": { fontSize: "0.75rem", color: "#6b7280", mt: 0.5 },
                }}
              />
            )}
          />
        </Box>

        {/* Current branch display */}
        <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#2563eb" }}>
            Current Branch:
          </Typography>
          <Chip label={currentBranch || "Loading..."} color="primary" variant="outlined" size="small" />
        </Box>

        {/* Branch Table */}
        <Box sx={{ mb: 1 }}>
        </Box>
        <Paper
  elevation={4}
  sx={{
    p: 2,
    borderRadius: 3,
    bgcolor: "#f0f9ff",
    border: "2.5px solid #0ea5e9",
    boxShadow: "0 4px 20px rgb(14 165 233 / 0.3)",
    mb: 3,
  }}
>
<Box sx={{ overflowX: 'auto' }}>
<DataGrid
 rows={branches}
 columns={columns}
 pageSize={2}
 pagination
 autoHeight
  onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
  checkboxSelection
  disableColumnMenu
  disableColumnSelector
  disableRowSelectionOnClick
  selectionModel={selectionModel}
  onRowSelectionModelChange={setSelectionModel}
  loading={branches.length === 0 && suggestions.length === 0}
  rowsPerPageOptions={[15, 30, 50]}
  getRowId={(row) => row.id}
  sx={{
    fontSize: 16,
    bgcolor: "#f0f9ff",
    borderRadius: 2,
    border: "none",
    "& .MuiDataGrid-row:hover": { bgcolor: "#d7f0fe" },
    "& .MuiDataGrid-checkboxInput": { color: "#0ea5e9" },
    "& .MuiDataGrid-cell": { fontWeight: 400 },
    "& .MuiDataGrid-columnHeaders": {
      bgcolor: "#e0f2fe",
      borderBottom: "2.5px solid #0ea5e9",
      fontWeight: 700,
      fontSize: 17,
    },
  }}
  components={{
    LoadingOverlay,
    NoRowsOverlay: () => (
      <Typography sx={{ mt: 6, fontSize: 22, color: "#8c8c8c" }}>No data to display.</Typography>
    ),
  }}
/>

</Box>
<Typography sx={{ mt: 2, fontSize: 14, color: '#64748b' }}>
  Showing {pageSize} per page | {branches.length} branches
</Typography>

</Paper>



        {/* Confirm Delete Selected Snackbar */}
        <Snackbar
          open={confirmDeleteSelectedOpen}
          onClose={() => setConfirmDeleteSelectedOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity="warning"
            sx={{ width: "100%" }}
            action={
              <>
                <Button
                  color="error"
                  size="small"
                  onClick={handleConfirmDeleteSelected}
                  disabled={deletingBranches.size > 0}
                  startIcon={deletingBranches.size > 0 ? <CircularProgress size={16} color="inherit" /> : <DeleteSweepIcon />}
                >
                  {deletingBranches.size > 0 ? "Deleting..." : "Delete"}
                </Button>
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => setConfirmDeleteSelectedOpen(false)}
                  disabled={deletingBranches.size > 0}
                >
                  Cancel
                </Button>
              </>
            }
          >
            Are you sure you want to delete <strong>{selectionModel.length}</strong> selected branch
            {selectionModel.length > 1 ? "es" : ""}?
          </Alert>
        </Snackbar>

        {/* Confirm Delete Single Snackbar */}
        <Snackbar
          open={confirmDelete.open}
          onClose={() => setConfirmDelete({ open: false, branchName: "" })}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity="warning"
            sx={{ width: "100%" }}
            action={
              <>
                <Button
                  color="error"
                  size="small"
                  onClick={handleConfirmDelete}
                  disabled={deletingBranches.has(confirmDelete.branchName)}
                  startIcon={
                    deletingBranches.has(confirmDelete.branchName) ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <DeleteIcon />
                    )
                  }
                >
                  {deletingBranches.has(confirmDelete.branchName) ? "Deleting..." : "Delete"}
                </Button>
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => setConfirmDelete({ open: false, branchName: "" })}
                  disabled={deletingBranches.has(confirmDelete.branchName)}
                >
                  Cancel
                </Button>
              </>
            }
          >
            Are you sure you want to delete branch&nbsp;
            <span style={{ fontWeight: 700, color: "#dc2626" }}>{confirmDelete.branchName}</span>?
          </Alert>
        </Snackbar>

        {/* General Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
            sx={{ width: "100%" }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* TS File Stats Dialog */}
        <Dialog
          open={statsOpen}
          onClose={() => setStatsOpen(false)}
          maxWidth="sm"
          PaperProps={{
            sx: {
              bgcolor: "#ffffff",
              borderRadius: 4,
              borderLeft: "8px solid #0ea5e9",
              boxShadow: "0 8px 32px #dbeafe80",
              minWidth: { xs: "95vw", sm: "540px" },
              p: 1,
            },
          }}
        >
          <DialogTitle
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              pb: 0.5,
              bgcolor: "#f0f9ff",
              borderRadius: "10px 10px 0 0",
              fontWeight: 800,
              color: "#0ea5e9",
            }}
          >
            <GitHubIcon sx={{ color: "#0ea5e9" }} />
            .ts File Change Stats — <span>{statsBranch}</span>
            <IconButton onClick={() => setStatsOpen(false)} sx={{ ml: "auto" }} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ py: 2 }}>
            {statsLoading && (
              <Box sx={{ textAlign: "center", my: 3 }}>
                <CircularProgress thickness={5} size={44} sx={{ color: "#0ea5e9" }} />
              </Box>
            )}
            {!statsLoading && statsError && (
              <Typography color="error" sx={{ mt: 3, mb: 3, fontSize: 22, textAlign: "center" }}>
                {statsError}
              </Typography>
            )}
            {!statsLoading && !statsError && Array.isArray(statsData) && statsData.length > 0 && (
              <Box sx={{ mt: 2, mb: 1 }}>
                <Paper elevation={2} sx={{ borderRadius: 3, p: 2, bgcolor: "#f3f7fa" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: "0 8px",
                      fontSize: 16,
                    }}
                  >
                    <thead>
                      <tr style={{ fontWeight: 700, color: "#0ea5e9" }}>
                        <th style={{ textAlign: "left", padding: 8 }}>File</th>
                        <th style={{ padding: 8 }}>+ Added</th>
                        <th style={{ padding: 8 }}>– Deleted</th>
                        <th style={{ padding: 8 }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsData.map((row) => (
                        <tr key={row.file} style={{ background: "#fff" }}>
                          <td
                            style={{
                              padding: 8,
                              fontFamily: "monospace",
                              fontSize: 15,
                              fontWeight: 600,
                              wordBreak: "break-all",
                            }}
                          >
                            {row.file}
                          </td>
                          <td style={{ padding: 8 }}>
                            <Chip label={`+${row.added}`} sx={{ bgcolor: "#e0fce4", color: "#16a34a", fontWeight: 700 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <Chip label={`–${row.deleted}`} sx={{ bgcolor: "#fee2e2", color: "#dc2626", fontWeight: 700 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <Chip
                              label={row.net > 0 ? `+${row.net}` : row.net < 0 ? `${row.net}` : "0"}
                              sx={{
                                bgcolor: row.net > 0 ? "#e0fce4" : row.net < 0 ? "#fee2e2" : "#e5e7eb",
                                color: row.net > 0 ? "#16a34a" : row.net < 0 ? "#dc2626" : "#171717",
                                fontWeight: 700,
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Paper>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, justifyContent: "center" }}>
            <Button
              onClick={() => setStatsOpen(false)}
              color="primary"
              variant="outlined"
              startIcon={<CloseIcon />}
              sx={{ borderRadius: 2, fontWeight: 700, minWidth: 90 }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
}

export default App;
