#!/usr/bin/bash
#
# Testing
# ./ansible-runner-service -s
# Cert identity and password may be overridden by environment variables - see help

VERBOSE=false
CONTAINER_OPTS="podman docker"
PREREQS="openssl curl"
ETCDIR="/etc/ansible-runner-service"
CERTSDIR="$ETCDIR/certs"
SERVERCERTS="$CERTSDIR/server"
CLIENTCERTS="$CERTSDIR/client"
RUNNERDIR="/usr/share/ansible-runner-service"
IMAGE_ID=''
CONTAINER_BIN=''
CONTAINER_RUN_OPTIONS=''
HOMEDIR=${HOME}
if [ $SUDO_USER ]; then
    HOMEDIR=$(getent passwd $SUDO_USER | cut -d: -f6)
fi
CEPH_ANSIBLE_HOSTS='/usr/share/ceph-ansible/hosts'

set_container_bin() {

    os_id=$(awk -F '=' '/^ID=/ { print $2 }' /etc/os-release | tr -d '"')
    version_id=$(awk -F '=' '/^VERSION_ID=/ { print $2 }' /etc/os-release | tr -d '.' | tr -d '"')
    if [ $os_id == "rhel" ]; then
            if [ $version_id -ge "80" ]; then
                  CONTAINER_OPTS="podman"
            else
                  CONTAINER_OPTS="docker"
            fi
    fi

    for option in ${CONTAINER_OPTS[@]}; do
        type $option > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            if $VERBOSE; then
                echo -e "\tOptional binary $option is present"
            fi
            CONTAINER_BIN=$option
            if [ $CONTAINER_BIN == "docker" ]; then
                CONTAINER_RUN_OPTIONS=' --rm -d '
            else
                CONTAINER_RUN_OPTIONS=' -d '
            fi
            break
        fi
    done
    if [ -z "$CONTAINER_BIN" ]; then
            echo "Please install in first place <podman> or <docker>"
            exit 1
    fi

}

create_server_certs() {

    # Server CA
    if [ ! -d "$SERVERCERTS" ]; then
        if $VERBOSE; then
            echo "Creating directories in <$ETCDIR> for server certificates"
            mkdir -p $SERVERCERTS
        fi
    fi

    if $VERBOSE; then
        echo "Creating the CA Key and Certificate for signing Client Certs"
        echo "- Using cert identity - $CERT_IDENTITY"
    fi

    openssl genrsa -des3 -out $SERVERCERTS/ca.key -passout pass:$CERT_PASSWORD 4096
    openssl req -new -x509 -sha256 -days 365 -key $SERVERCERTS/ca.key \
        -out $SERVERCERTS/ca.crt -passin pass:$CERT_PASSWORD \
        -subj "$CERT_IDENTITY"

    # Server cert
    if $VERBOSE; then echo "Creating the Server Key, CSR, and Certificate"; fi
    openssl genrsa -des3 -out $SERVERCERTS/server.key.org \
        -passout pass:$CERT_PASSWORD 4096
    # Remove password (avoid server claiming for it each time it starts)
    openssl rsa -in $SERVERCERTS/server.key.org -out $SERVERCERTS/server.key \
        -passin pass:$CERT_PASSWORD
    # Generate server certificate
    openssl req -new -sha256 -key $SERVERCERTS/server.key -out $SERVERCERTS/server.csr \
        -passin pass:$CERT_PASSWORD -subj "$CERT_IDENTITY"

    if $VERBOSE; then echo "Self-signing the certificate with our CA cert"; fi
    openssl x509 -req -sha256 -days 365 -in $SERVERCERTS/server.csr \
        -CA $SERVERCERTS/ca.crt -CAkey $SERVERCERTS/ca.key \
        -set_serial 01 -out $SERVERCERTS/server.crt -passin pass:$CERT_PASSWORD
}

create_client_certs() {

    if [ ! -d "$CLIENTCERTS" ]; then
        if $VERBOSE; then
            echo "Creating directories in <$ETCDIR> for client certificates"
            mkdir -p $CLIENTCERTS
        fi
    fi

    if $VERBOSE; then
        echo "Creating the Client Key and CSR"
        echo "- Using client identity - $CERT_IDENTITY_CLIENT"
    fi

    openssl genrsa -des3 -out $CLIENTCERTS/client.key.org -passout pass:$CERT_PASSWORD 4096
    # Remove password (avoid https client claiming for it in each request)
    openssl rsa -in $CLIENTCERTS/client.key.org -out $CLIENTCERTS/client.key \
        -passin pass:$CERT_PASSWORD
    # Generate client certificate
    openssl req -new -sha256 -key $CLIENTCERTS/client.key -out $CLIENTCERTS/client.csr \
        -passin pass:$CERT_PASSWORD -subj "$CERT_IDENTITY_CLIENT"

    if $VERBOSE; then echo "Signing the client certificate with our CA cert"; fi
    openssl x509 -req -sha256 -days 365 -in $CLIENTCERTS/client.csr -CA $SERVERCERTS/ca.crt \
        -CAkey $SERVERCERTS/ca.key -CAcreateserial -out $CLIENTCERTS/client.crt \
        -passin pass:$CERT_PASSWORD
}

create_certs() {
    echo "Checking SSL certificate configuration"
    if [ ! -f "$SERVERCERTS/ca.crt" ]; then
        create_server_certs
    fi

    if [ ! -f "$CLIENTCERTS/client.crt" ]; then
        create_client_certs
    fi

    # when running under sudo, we need to 
    # a) change the ownership of the certs to allow the cockpit UI to read them. (UI fails to load otherwise!)
    # b) set the config of the runner-service to use the sudo account not root
    # c) check to see if the users ssh configuration can be applied to the runner-service
    if [[ $SUDO_USER ]]; then
        echo "Setting ownership of the certs to your user account($SUDO_USER)"
        /usr/bin/chown -R $SUDO_USER $CERTSDIR

        create_runner_config

        if [ -f "$HOMEDIR/.ssh/id_rsa" ] && [ -f "$HOMEDIR/.ssh/id_rsa.pub" ]; then
            echo "Copying ${SUDO_USER} user's ssh config to the ansible-runner configuration" 
            cp $HOMEDIR/.ssh/id_rsa /usr/share/ansible-runner-service/env/ssh_key
            cp $HOMEDIR/.ssh/id_rsa.pub /usr/share/ansible-runner-service/env/ssh_key.pub
        else
            echo "'$SUDO_USER' does not have an ssh config(RSA), one will be generated and sync'd with the runner-service"
        fi
    fi

}

transfer_ssh_keys() {
    # only executed during sudo invocation
    if [ ! -f "$HOMEDIR/.ssh/id_rsa" ] && [ ! -f "$HOMEDIR/.ssh/id_rsa.pub" ]; then
        echo "Sync'ing ${SUDO_USER}'s ssh config with the runner-service ssh credentials"
        mkdir -p $HOMEDIR/.ssh
        chmod 700 $HOMEDIR/.ssh
        cp /usr/share/ansible-runner-service/env/ssh_key $HOMEDIR/.ssh/id_rsa 
        cp /usr/share/ansible-runner-service/env/ssh_key.pub $HOMEDIR/.ssh/id_rsa.pub
        SUDO_GROUP=$(getent passwd $SUDO_USER | cut -d: -f1)
        chown -R $SUDO_USER:$SUDO_GROUP $HOMEDIR/.ssh
    fi
}

create_runner_config() {
    # only executed during sudo invocation
    local config_file="$ETCDIR/config.yaml"
    if [ -f "$config_file" ]; then
        echo "Warning: resetting existing config (old version saved with _bkup suffix)"
        /usr/bin/cp $config_file ${config_file}_bkup
    fi
    echo "Setting target user for ansible connections to $SUDO_USER"
    echo -e "---\nversion: 1\n\ntarget_user: $SUDO_USER" > $config_file
    chown $SUDO_USER $config_file
}

set_image_id() {
    # set the image id, ignoring any tag that could be present in the
    # container name
    old_IFS=$IFS
    IFS=':' read -ra image <<< "$CONTAINER_IMAGE_NAME"
    IFS=${old_IFS}
    IMAGE_ID=$($CONTAINER_BIN images | grep ${image[0]} | awk -F ' ' '{print $3}')
}

fetch_container() {
    
    set_image_id

    if [ -z "$IMAGE_ID" ]; then
        echo "Fetching Ansible API container (runner-service). Please wait..."
        $CONTAINER_BIN pull "$CONTAINER_IMAGE_NAME"
        if [[ $? -ne 0 ]]; then
            echo "Failed to fetch the container. Unable to continue"
            exit 4
        else
            set_image_id
        fi
    else
        echo "Using the Ansible API container already downloaded (runner-service)"
    fi
}

start_container() {
    echo "Starting Ansible API container (runner-service)"
    local OLD_IMAGE
    $CONTAINER_BIN ps -a | grep runner-service > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        # container exists from a prior run - remove it for a clean start
        echo -e "- Removing old container image from the last run ... \c"
        OLD_IMAGE=$($CONTAINER_BIN rm -f runner-service)
        if [ $? -eq 0 ]; then
            echo "OK (removed $OLD_IMAGE)"
        else
            echo "Failed. Unable to remove the old container, manual intervention required"
            exit 1
        fi
    fi

    $CONTAINER_BIN run $CONTAINER_RUN_OPTIONS --network=host -p 5001:5001/tcp \
               -v /usr/share/ansible-runner-service:/usr/share/ansible-runner-service \
               -v /usr/share/ceph-ansible:/usr/share/ansible-runner-service/project \
               -v /etc/ansible-runner-service:/etc/ansible-runner-service \
               --name runner-service $IMAGE_ID > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "Started runner-service container"
    else
        echo "Failed to start the container"
        exit 8
    fi
}

stop_runner_service() {
    echo "Stopping the Ansible API container (runner-service)"
    $CONTAINER_BIN kill runner-service > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        $CONTAINER_BIN rm -f runner-service > /dev/null 2>&1
    fi
}

setup_dirs() {
    echo "Checking/creating directories"

    if [ ! -d "$RUNNERDIR" ]; then
        if $VERBOSE; then
            echo "Creating directories in $RUNNERDIR"
        fi
        mkdir -p /usr/share/ansible-runner-service/{artifacts,env,inventory,iso}
        ln -s /usr/share/ceph-ansible /usr/share/ansible-runner-service/project
        chcon -Rt container_file_t /usr/share/ansible-runner-service
    fi
    if [ ! -d "$ETCDIR" ]; then
        if $VERBOSE; then
            echo "Creating directories in $ETCDIR"
        fi
        mkdir -p $ETCDIR/certs/{server,client}
    fi

}

# Unused
check_context() {
    # $1 = directory to check
    # $2 = context to match against
    local dir_context=$(ls -dZ $1 | cut -d':' -f3)
    if $VERBOSE; then echo "path $1 has context $dir_context"; fi
    [ "$dir_context" == $2 ]
}

set_selinux() {

    # etc and /usr/share dirs must have a container context
    for path in '/etc/ansible-runner-service' '/usr/share/ceph-ansible'; do
        echo "Applying SELINUX container_file_t context to '$path'"
        chcon -Rt container_file_t $path > /dev/null 2>&1
        if [ $? -ne 0 ]; then
            echo "Unable to set SELINUX context on $path. Can not continue"
            exit
        fi
    done

}

set_upstream_image() {
    CONTAINER_IMAGE_NAME="jolmomar/ansible_runner_service"
}

set_default_image () {
    # upstream container image
    local vendor
    /usr/bin/which rpm > /dev/null 2>&1
    if [ $? -eq 0 ]; then 
        # this is an rpm distro, check for redhat
        vendor=$(rpm -q cockpit-ceph-installer --qf "%{VENDOR}")
        case $vendor in
            "Red Hat, Inc.")
                CONTAINER_IMAGE_NAME="registry.redhat.io/rhceph/ansible-runner-rhel8:latest"
                ;;
            *)
                set_upstream_image
                ;;
        esac
    else
        # use upstream by default
        set_upstream_image
    fi
}

environment_ok() {
    local errors=''
    local out=''
    echo "Checking environment is ready"

    # must run as root, or sudo
    if [ "$UID" != "0" ]; then
        errors+="\tScript must run as root, or a sudo enabled user\n"
    fi

    if [ -z "$CONTAINER_BIN" ]; then
        errors+="\tOne of $CONTAINER_OPTS subsystems must be present on the system"
    fi

    for binary in ${PREREQS[@]}; do
        type $binary > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            if $VERBOSE; then
                echo -e "\t$binary is present"
            fi
        else
            errors+="\t$binary not found.\n"
        fi
    done

    if [[ ! -d "/usr/share/ceph-ansible" ]]; then
        errors+="\tceph-ansible is not installed.\n"
    fi

    $CONTAINER_BIN ps > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        errors+="\tcontainer daemon not running\n"
    fi


    # set variables according to environment vars
    local HOST=$(hostname)
    [ -z "$CERT_IDENTITY" ] && CERT_IDENTITY="/C=US/ST=North Carolina/L=Raleigh/O=Red Hat/OU=RunnerServer/CN=$HOST"
    [ -z "$CERT_IDENTITY_CLIENT" ] && CERT_IDENTITY_CLIENT="/C=US/ST=North Carolina/L=Raleigh/O=Red Hat/OU=RunnerClient/CN=$HOST"
    [ -z "$CERT_PASSWORD" ] && CERT_PASSWORD="ansible"
    [ -z "$CONTAINER_IMAGE_NAME" ] && set_default_image


    if [ "$errors" != "" ]; then
        echo "- Problems found"
        echo -e "$errors"
        return 1
    else
        return 0
    fi

}

usage() {
    echo -e "Usage: ansible-runner-service.sh [-hvsqk]"
    echo -e "\t-h ... display usage information"
    echo -e "\t-v ... verbose mode"
    echo -e "\t-s ... start ansible runner service container (default)"
    echo -e "\t-q ... query the state of the container, and tail it's log"
    echo -e "\t-k ... stop/kill the ansible runner service container\n"
    echo "The service uses mutual TLS auth and will set up self-signed certs if they are not provided."
    echo "Certs are stored in the following locations;"
    echo -e "\t server certs ... $SERVERCERTS"
    echo -e "\t client certs ... $CLIENTCERTS\n"
    echo "Self signed certificates use defaults for server/client identity and certificate password. To"
    echo "override the defaults, simply set the environment variables before invoking this utility"
    echo -e "\t CERT_IDENTITY ... server certificate id (subject)"
    echo -e "\t CERT_IDENTITY_CLIENT ... server certificate id (subject)"
    echo -e "\t CERT_PASSWORD ... password used to lock and access the server cert\n"
    echo "e.g."
    echo -e "> CERT_PASSWORD='supersecret' ./ansible-runner-service.sh -v -s\n"
    echo -e "Ansible Runner Service container image name can be customized (<ansible-runner-service> by default) using a environment variable:\n"
    echo -e "\t CONTAINER_IMAGE_NAME ... string used in the <pull> command to get the ARS container image\n"
    echo "e.g."
    echo -e "> CONTAINER_IMAGE_NAME='rhceph/ansible-runner-rhel8:latest' ./ansible-runner-service.sh -v -s\n"
}

is_running() {
    if $VERBOSE; then echo "Checking container is active"; fi

    $CONTAINER_BIN ps | grep runner-service > /dev/null 2>&1
}

check_access() {
    echo "Waiting for Ansible API container (runner-service) to respond"
    local ctr=1
    local limit=10
    while [ $ctr -le $limit ]; do
        HTTP_STATUS=$(curl -s -i -k \
                        -o /dev/null \
                        -w "%{http_code}" \
                        --key $CLIENTCERTS/client.key \
                        --cert $CLIENTCERTS/client.crt \
                        https://localhost:5001/api/v1/playbooks -X GET)
        if [ "$HTTP_STATUS" -ne 0 ]; then
            break
        fi
        if $VERBOSE; then echo "- probe ($ctr/$limit)"; fi
        sleep 1
        ((ctr++))
    done

    return $HTTP_STATUS
}

manage_ansible_hosts_file() {
    echo "Linking the runner service inventory to ceph-ansible hosts"
    # create hosts file if it doesn't exist
    [ ! -f "$CEPH_ANSIBLE_HOSTS" ] && touch $CEPH_ANSIBLE_HOSTS

    # Set up a new hosts file if the hosts file contains hosts details already or it is an INI file

    if [ -s "$CEPH_ANSIBLE_HOSTS" ]; then
        echo "Inventory file already present with host details. Set up a new one to use with the installer"
        hosts_dir=$(dirname "$CEPH_ANSIBLE_HOSTS")
        save_file="${CEPH_ANSIBLE_HOSTS}.orig"
        if [ -f "$save_file" ]; then
            epoc=$(date +%s)
            save_file="${save_file}-${epoc}"
        fi
        echo "- saving existing ansible hosts to $save_file"
        mv $CEPH_ANSIBLE_HOSTS $save_file
        # Set up a new hosts file for the installer
        touch $CEPH_ANSIBLE_HOSTS
    fi

    ln -s $CEPH_ANSIBLE_HOSTS /usr/share/ansible-runner-service/inventory/hosts
    if [ $? -eq 0 ]; then
        echo "- ansible hosts linked to runner-service inventory"
    else
        echo "WARNING: failed to apply the symlink, please investigate"
    fi
}

start_runner_service() {

    if ! environment_ok; then
        echo "Unable to start the Ansible API (runner-service) container"
        exit
    fi

    if is_running; then
        echo "The Ansible API container (runner-service) is already running - no action necessary"
        exit
    fi

    setup_dirs

    create_certs

    if [ $(getenforce) == "Enforcing" ]; then
        set_selinux
    fi

    echo "Ansible API (runner-service) container set to $CONTAINER_IMAGE_NAME"

    fetch_container

    start_container

    check_access
    CURL_RC=$?
    case $CURL_RC in
        0)
            echo "Unable to connect to the Ansible API container (runner-service)"
            exit 1
            ;;
        200)
            echo "The Ansible API container (runner-service) is available and responding to requests"
            echo -e "\nLogin to the cockpit UI at https://$(hostname -f):9090/cockpit-ceph-installer to start the install"
            ;;
        *)
            echo "The Ansible API container (runner-service) responded with unexpected status code: $CURL_RC"
            exit 1
            ;;
    esac

    if [[ $SUDO_USER ]]; then
        transfer_ssh_keys
    fi

    manage_ansible_hosts_file
}

show_state() {
    # show the current logs for debugging. User will need to ctrl-c to exit
    echo "Container status"
    echo "----------------"
    $CONTAINER_BIN ps --filter=name=runner-service
    echo -e "\nWatching the active log (/var/log/uwsgi.log) - CTRL-C to exit"
    echo      "-------------------------------"
    $CONTAINER_BIN exec runner-service tail -n 100 -f /var/log/uwsgi.log
}

main() {

    if [[ "$@[@]" =~ "-v" ]]; then
        VERBOSE=true
    fi

    set_container_bin

    while getopts ":khsqv" option; do
        case "${option}" in
            h)
                usage
                exit
                ;;
            s)
                start_runner_service
                exit
                ;;
            k)
                is_running
                if [[ $? -eq 0 ]]; then
                    stop_runner_service
                    if [[ $? -eq 0 ]]; then
                        echo "Stopped runner-service"
                    else
                        echo "Failed to stop the runner-service container."
                    fi
                else
                    echo "runner-service container is not active...did you mean to start it?"
                fi
                exit
                ;;
            q)
                is_running
                if [[ $? -eq 0 ]]; then
                    show_state
                else
                    echo "runner-service is not active"
                fi
                exit
                ;;
            \?)
                echo "Unsupported option."
                usage
                exit
                ;;
        esac
    done

    # default behaviour is start it!
    start_runner_service
}

main $@
