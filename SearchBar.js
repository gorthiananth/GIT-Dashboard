import React, { useState, useEffect, useCallback, useRef } from "react";
import { Autocomplete, TextField, CircularProgress, Box } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { debounce } from "../utils/debounce";
import { fetchSuggestionsApi } from "../api/branchApi";

export default function SearchBar({ setQuery, deletingBranches }) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const suggestionsCacheRef = useRef({});
  const abortControllerRef = useRef(null);

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
      const names = await fetchSuggestionsApi(input, abortControllerRef.current.signal);
      suggestionsCacheRef.current[input] = names;
      setSuggestions(names);
    } catch (e) {
      if (e.name === "AbortError") return; // fetch aborted
      setSuggestions([]);
    }
  };

  const debouncedFetchSuggestions = useCallback(debounce(fetchSuggestions, 400), []);

  useEffect(() => {
    debouncedFetchSuggestions(search);
  }, [search, debouncedFetchSuggestions]);

  return (
    <Box sx={{
      my: 3, mb: 4,
      display: "flex",
      alignItems: "center",
      gap: 1,
      boxShadow: "0 2px 8px rgb(14 165 233 / 0.2)",
      borderRadius: 3,
      bgcolor: "#f0f9ff",
      p: 1.5,
      maxWidth: { xs: "100%", sm: 440 },
    }}>
      <SearchIcon sx={{ color: "#0ea5e9", ml: 1 }} />
      <Autocomplete
        freeSolo
        disableClearable
        options={suggestions}
        inputValue={search}
        onInputChange={(e, newInputValue) => {
          setSearch(newInputValue);
          if (newInputValue === "") setQuery("");
        }}
        onChange={(e, newValue) => {
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
  );
}

