import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import CircularProgress from "@mui/material/CircularProgress";

export function ConfirmDeleteSingleDialog({ open, branchName, onConfirm, onCancel, isDeleting }) {
  return (
    <Dialog open={open} onClose={isDeleting ? null : onCancel} maxWidth="xs" fullWidth>
      <Alert
        severity="warning"
        sx={{ m: 2 }}
        action={
          <>
            <Button
              color="error"
              size="small"
              onClick={onConfirm}
              disabled={isDeleting}
              startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
            <Button
              color="inherit"
              size="small"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </>
        }
      >
        Are you sure you want to delete branch&nbsp;
        <strong style={{ color: "#dc2626" }}>{branchName}</strong>?
      </Alert>
    </Dialog>
  );
}

export function ConfirmDeleteMultipleDialog({ open, count, onConfirm, onCancel, isDeleting }) {
  return (
    <Dialog open={open} onClose={isDeleting ? null : onCancel} maxWidth="xs" fullWidth>
      <Alert
        severity="warning"
        sx={{ m: 2 }}
        action={
          <>
            <Button
              color="error"
              size="small"
              onClick={onConfirm}
              disabled={isDeleting}
              startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteSweepIcon />}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
            <Button
              color="inherit"
              size="small"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </>
        }
      >
        Are you sure you want to delete <strong>{count}</strong> selected branch{count > 1 ? "es" : ""}?
      </Alert>
    </Dialog>
  );
}

