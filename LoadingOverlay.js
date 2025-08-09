import LoadingOverlay from "./frontend/LoadingOverlay";
import SearchBar from "./frontend/SearchBar";
import { ConfirmDeleteSingleDialog, ConfirmDeleteMultipleDialog } from "./frontend/ConfirmDeleteDialog";
import React from "react";
import { Box, Skeleton } from "@mui/material";

export default function LoadingOverlay() {
  return (
    <Box sx={{ p: 2 }}>
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1, borderRadius: 1 }} animation="wave" />
      ))}
    </Box>
  );
}

