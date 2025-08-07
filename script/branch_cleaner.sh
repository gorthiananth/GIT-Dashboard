#!/bin/bash

# Path to your local git repository
REPO="/Users/agorthi/Downloads/repo/manager"
cd "$REPO" || { echo "❌ Failed to navigate to repo path."; exit 1; }

# Print table header
print_header() {
  printf "| %-45s | %-27s | %-27s |\n" "Branch Name" "Committer Date" "Creation Date"
  printf "|%s|\n" "$(printf '%.0s-' {1..45}) $(printf '%.0s-' {1..27}) $(printf '%.0s-' {1..27})"
}

# Get creation date of a branch
get_creation_date() {
  git reflog show --date=iso "$1" | tail -1 | sed -E 's/.*\{([^}]+)\}.*/\1/'
}

# Print all branches
print_all_branches() {
  git for-each-ref --sort=-committerdate --format='%(refname:short):%(committerdate:iso)' refs/heads | while IFS=: read -r name date; do
    created=$(get_creation_date "$name")
    printf "| %-45s | %-27s | %-27s |\n" "$name" "$date" "$created"
  done
}

while true; do

  print_header
  print_all_branches
  echo ""
  echo -e "\nOptions:"
  echo "1. Delete by exact branch name"
  echo "2. Delete all branches with commit date matching a month (e.g., 2025-03)"
  echo "3. Search branches by name or date"

  read -rp "Enter option (1, 2, or 3): " opt

  if [[ "$opt" == "1" ]]; then
    read -rp "Enter exact branch name to delete: " branch
    if git show-ref --quiet --verify "refs/heads/$branch"; then
      read -rp "Are you sure you want to delete branch '$branch'? [y/N]: " confirm
      if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo "🗑️ Deleting branch: $branch"
        git branch -D "$branch"
      else
        echo "⚠️ Skipped deletion of branch: $branch"
      fi
    else
      echo "❌ Branch not found: $branch"
    fi

  elif [[ "$opt" == "2" ]]; then
    read -rp "Enter commit month to match (YYYY-MM): " month
    echo ""
    matches=()
    while IFS=: read -r name date; do
      if [[ "$date" == "$month"* ]]; then
        matches+=("$name:$date")
      fi
    done < <(git for-each-ref --format='%(refname:short):%(committerdate:iso)' refs/heads)
    if [ "${#matches[@]}" -eq 0 ]; then
      echo "❌ No branches found for month: $month"
    else
      echo "Branches matching $month:"
      print_header
      for entry in "${matches[@]}"; do
        branch="${entry%%:*}"
        date="${entry#*:}"
        created=$(get_creation_date "$branch")
        printf "| %-45s | %-27s | %-27s |\n" "$branch" "$date" "$created"
      done
      read -rp "Are you sure you want to delete ALL above branches? [y/N]: " confirm
      if [[ "$confirm" =~ ^[Yy]$ ]]; then
        for entry in "${matches[@]}"; do
          branch="${entry%%:*}"
          echo "🗑️ Deleting branch: $branch"
          git branch -D "$branch"
        done
      else
        echo "⚠️ Deletion skipped."
      fi
    fi

  elif [[ "$opt" == "3" ]]; then
    read -rp "Enter branch name or date string to search (supports contains or regex like /pattern/): " keyword
    if [[ "$keyword" =~ ^/.*/$ ]]; then
      match_type=regex
      regex_pattern="${keyword:1:-1}"
      echo "🔍 Searching with regex (case-insensitive): '$regex_pattern'"
    else
      match_type=contains
      echo "🔍 Searching with contains (case-insensitive): '$keyword'"
    fi
    echo ""
    matches=()
    while IFS=: read -r name date; do
      name_lc=$(echo "$name" | tr 'A-Z' 'a-z')
      date_lc=$(echo "$date" | tr 'A-Z' 'a-z')
      keyword_lc=$(echo "$keyword" | tr 'A-Z' 'a-z')
      if [[ "$match_type" == "regex" ]]; then
        if [[ "$name_lc" =~ $regex_pattern || "$date_lc" =~ $regex_pattern ]]; then
          matches+=("$name:$date")
        fi
      else
        if [[ "$name_lc" == *"$keyword_lc"* || "$date_lc" == *"$keyword_lc"* ]]; then
          matches+=("$name:$date")
        fi
      fi
    done < <(git for-each-ref --format='%(refname:short):%(committerdate:iso)' refs/heads)
    if [ "${#matches[@]}" -eq 0 ]; then
      echo "❌ No branches found containing or matching: $keyword"
    else
      echo "Branches containing or matching '$keyword':"
      print_header
      for entry in "${matches[@]}"; do
        branch="${entry%%:*}"
        date="${entry#*:}"
        created=$(get_creation_date "$branch")
        printf "| %-45s | %-27s | %-27s |\n" "$branch" "$date" "$created"
      done
      read -rp "Do you want to checkout to one of the above branches? [y/N]: " confirm
      if [[ "$confirm" =~ ^[Yy]$ ]]; then
        read -rp "Enter the exact branch name to checkout: " checkout_branch
        if git show-ref --quiet --verify "refs/heads/$checkout_branch"; then
          echo "📦 Checking out to branch: $checkout_branch"
          git checkout "$checkout_branch"
        else
          echo "❌ Branch not found: $checkout_branch"
        fi
      else
        echo "ℹ️ Checkout skipped."
      fi
    fi

  else
    echo "❌ Invalid option selected."
  fi

  echo ""
  read -rp "Do you want to continue? [y/N]: " repeat
  if [[ ! "$repeat" =~ ^[Yy]$ ]]; then
    echo "🙏 Thanks for using the script. 👋"
    break
  fi

done
