#!/bin/bash

# Define the target directory
TARGET_DIR="/Users/agorthi/Downloads/repo/manager"

# Define the second target directory based on the first
TARGET_DIR2="$TARGET_DIR/packages/manager"

# Function to run pnpm commands
run_pnpm_commands() {
    echo "Ensuring dependencies are present..."
    pnpm install || { echo "Initial pnpm install failed"; exit 1; }

    echo "Running pnpm clean..."
    pnpm clean || { echo "pnpm clean failed"; exit 1; }

    echo "Reinstalling dependencies after clean..."
    pnpm install || { echo "pnpm install failed"; exit 1; }

    echo "Running pnpm bootstrap..."
    pnpm bootstrap || { echo "pnpm bootstrap failed"; exit 1; }

    echo "Running pnpm dev..."
    pnpm dev || { echo "pnpm dev failed"; exit 1; }

    echo "pnpm commands completed successfully."
}

# Check if we are in the correct directory, if not, navigate there
if [ "$(pwd)" != "$TARGET_DIR" ]; then
    echo "Not in the correct directory. Changing to $TARGET_DIR..."
    cd "$TARGET_DIR" || { echo "Failed to change directory to $TARGET_DIR"; exit 1; }
else
    echo "Already in the correct directory: $TARGET_DIR"
fi

# Display the current Git branch
current_branch=$(git branch --show-current)
echo "You are currently on the branch: $current_branch"

# Prompt for the action you want to perform
echo "Choose an option:"
echo "1) Create a branch and run pnpm commands."
echo "2) Skip branch creation and just run pnpm commands."
echo "3) Run Cypress Automation tests."

read -p "Enter option (1, 2, or 3): " choice

# Option 1: Create branch and run pnpm commands
if [ "$choice" == "1" ]; then
    read -p "Enter the remote repository name (e.g., aclp, linode, ankita, nikil, santosh, venky): " remote_repo

    if [ "$remote_repo" == "aclp" ]; then
        targetbranch="aclp_develop"
    elif [ "$remote_repo" == "linode" ]; then
        targetbranch="develop"
    else
        echo "Available branches from $remote_repo:"
        git branch -r | grep "^  $remote_repo/" | sed "s/^  $remote_repo\///"
        echo ""
        read -p "Enter the exact feature branch name from remote '$remote_repo': " targetbranch
    fi

    echo "Fetching latest updates from remote repository: $remote_repo..."
    git fetch "$remote_repo" || { echo "Failed to fetch from $remote_repo"; exit 1; }

    # Verify branch exists before proceeding
    if ! git show-ref --verify --quiet "refs/remotes/$remote_repo/$targetbranch"; then
        echo "❌ Remote branch '$remote_repo/$targetbranch' does not exist. Please check the name and try again."
        exit 1
    fi

    current_date=$(date "+%B %d")
    month=$(echo "$current_date" | cut -d ' ' -f 1)
    day=$(echo "$current_date" | cut -d ' ' -f 2)

    read -p "Enter the branch name to create: " branchname
    branchname_with_prefix="${branchname}_${remote_repo}_${month}_${day}"
    command="git checkout -b $branchname_with_prefix $remote_repo/$targetbranch"

    echo "The following command will be executed: $command"
    read -p "Do you want to execute this git command? (y/n): " confirm_git

    if [ "$confirm_git" == "y" ] || [ "$confirm_git" == "Y" ]; then
        eval "$command" || { echo "Failed to execute git command"; exit 1; }
        echo "Successfully created and checked out to branch: $branchname_with_prefix from $remote_repo/$targetbranch"
    else
        echo "Aborted. Command not executed."
        exit 1
    fi

    osascript -e "tell application \"Terminal\" to do script \"cd '$TARGET_DIR' && pnpm clean && pnpm install && pnpm bootstrap && pnpm dev\""
    sleep 100
    osascript -e "tell application \"Terminal\" to do script \"cd '$TARGET_DIR2' && pnpm cy:run -s 'cypress/e2e/core/cloudpulse/*.spec.ts'\""

fi

# Option 2: Skip branch creation and just run pnpm commands
if [ "$choice" == "2" ]; then
    echo "You are currently on the branch: $current_branch"
    echo "Skipping branch creation. Proceeding to pnpm commands..."

    read -p "Do you want to proceed with pnpm clean, install, bootstrap, and dev? (y/n): " confirm_pnpm

    if [ "$confirm_pnpm" == "y" ] || [ "$confirm_pnpm" == "Y" ]; then
        remote_branch_info=$(git for-each-ref --format='%(upstream:short)' "$(git symbolic-ref -q HEAD)")

        if [ -n "$remote_branch_info" ]; then
            remote_name=$(echo "$remote_branch_info" | cut -d'/' -f1)
            branch_name=$(echo "$remote_branch_info" | cut -d'/' -f2-)
            echo "Tracking remote found: $remote_name/$branch_name"
            read -p "Do you want to pull latest changes from $remote_name/$branch_name? (y/n): " confirm
            if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
                git pull "$remote_name" "$branch_name"
            else
                echo "Pull skipped."
            fi
        else
            echo "⚠️ No tracking remote found for current branch: $current_branch"
            read -p "Enter the remote name (e.g., ankita, nikil, santosh, venky, origin): " remote_name
            echo "Available branches from $remote_name:"
            git branch -r | grep "^  $remote_name/" | sed "s/^  $remote_name\///"
            echo ""
            read -p "Enter the branch name to pull from: " branch_name
            if git show-ref --verify --quiet "refs/remotes/$remote_name/$branch_name"; then
                read -p "Confirm pull from $remote_name/$branch_name? (y/n): " confirm
                if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
                    git pull "$remote_name" "$branch_name"
                else
                    echo "Pull skipped."
                fi
            else
                echo "❌ Remote branch '$remote_name/$branch_name' does not exist. Please check the name and try again."
                exit 1
            fi
        fi

        run_pnpm_commands
    else
        echo "Aborted. Exiting script."
        exit 1
    fi
fi

# Option 3: Run Cypress Automation tests
if [ "$choice" == "3" ]; then
    echo "You chose to run the Cypress automation tests."
    read -p "Do you want to proceed with running the Cypress tests? (y/n): " confirm_automation

    if [ "$confirm_automation" == "y" ] || [ "$confirm_automation" == "Y" ]; then
        read -p "Would you like to start the server and run the automation tests? (y/n): " start_server

        read -p "Enter the Cypress spec path to run (default: cypress/e2e/core/cloudpulse/*): " spec_path
        spec_path=${spec_path:-'cypress/e2e/core/cloudpulse/*'}

        if [ "$start_server" == "y" ] || [ "$start_server" == "Y" ]; then
            echo "Checking if port 3000 is in use..."
            PORT_3000_PROCESS=$(lsof -ti:3000)
            if [ -n "$PORT_3000_PROCESS" ]; then
                echo "Port 3000 is in use. PID(s): $PORT_3000_PROCESS"
                read -p "Kill these process(es)? (y/n): " kill_confirm
                if [ "$kill_confirm" == "y" ]; then
                    kill -9 $PORT_3000_PROCESS
                fi
            fi

            osascript -e "tell application \"Terminal\" to do script \"cd '$TARGET_DIR' && pnpm clean && pnpm install && pnpm bootstrap && pnpm dev\""

            echo "Waiting for server to be ready at http://localhost:3000..."
            for i in {1..30}; do
                if curl -s http://localhost:3000 > /dev/null; then
                    echo "Server is up!"
                    break
                fi
                sleep 3
            done
        fi

        osascript -e "tell application \"Terminal\" to do script \"cd '$TARGET_DIR2' && pnpm cy:run -s '$spec_path'\""

        echo "Cypress automation tests are now running."
    else
        echo "Aborted. Exiting script."
        exit 1
    fi
fi
