#!/usr/bin/bash
#
# Testing
# ./ansible-runner-service -s
# Cert identity and password may be overridden by environment variables - see help

VERBOSE=false
CONTAINER_OPTS="podman docker"
PREREQS="openssl curl"
ETCDIR="/etc/ansible-runner-service"
SERVERCERTS="$ETCDIR/certs/server"
CLIENTCERTS="$ETCDIR/certs/client"
RUNNERDIR="/usr/share/ansible-runner-service"
CONTAINER_IMAGE_NAME="ansible-runner-service"

CONTAINER_BIN=''
CONTAINER_RUN_OPTIONS=''

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
}

fetch_container() {
    IMAGE_ID=$($CONTAINER_BIN images | grep $CONTAINER_IMAGE_NAME | awk -F ' ' '{print $3}')
    if [ -z "$IMAGE_ID" ]; then
        echo "Fetching ansible runner service container. Please wait..."
        $CONTAINER_BIN pull "$CONTAINER_IMAGE_NAME"
        if [[ $? -ne 0 ]]; then
            echo "Failed to fetch the container. Unable to continue"
            exit 4
        else
            IMAGE_ID=$($CONTAINER_BIN images | grep $CONTAINER_IMAGE_NAME | awk -F ' ' '{print $3}')
        fi
    else
        echo "Using the ansible_runner_service container already downloaded"
    fi
}

start_container() {
    echo "Starting runner-service container"
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
    echo "Stopping runner-service"
    $CONTAINER_BIN kill runner-service > /dev/null 2>&1
}

setup_dirs() {
    echo "Checking/creating directories"

    if [ ! -d "$RUNNERDIR" ]; then
        if $VERBOSE; then
            echo "Creating directories in $RUNNERDIR"
        fi
        mkdir -p /usr/share/ansible-runner-service/{artifacts,env,inventory}
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

environment_ok() {
    local errors=''
    local out=''
    echo "Checking environment is ready"

    # must run as root
    if [ $(whoami) != 'root' ]; then
        errors+="\tScript must run as the root user\n"
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

    if [ "$errors" != "" ]; then
        echo "- Problems found"
        echo -e "$errors"
        return 1
    else
        return 0
    fi

}

usage() {
    echo -e "Usage: ansible-runner-service [-hvsk]"
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
    echo "> CERT_PASSWORD='supersecret' ./ansible-runner-service.sh -v -s"
}

is_running() {
    if $VERBOSE; then echo "Checking container is active"; fi

    $CONTAINER_BIN ps | grep runner-service > /dev/null 2>&1
}

check_access() {
    echo "Waiting for runner-service container to respond"
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

start_runner_service() {

    if ! environment_ok; then
        echo "Unable to start the ansible_runner_service container"
        exit
    fi

    if is_running; then
        echo "runner-service container is already running"
        exit
    fi

    setup_dirs

    create_certs

    if [ $(getenforce) == "Enforcing" ]; then
        set_selinux
    fi

    fetch_container

    start_container

    check_access
    CURL_RC=$?
    case $CURL_RC in
        0)
            echo "Unable to connect to the container"
            ;;
        200)
            echo "runner-service container is available and responding to requests"
            ;;
        *)
            echo "runner-service container responded with unexpected status code: $CURL_RC"
            ;;
    esac

}

show_state() {
    # show the current logs for debugging. User will need to ctrl-c to exit
    echo "Container status"
    echo "----------------"
    $CONTAINER_BIN ps --filter=name=runner-service
    echo -e "\nActive log (/var/log/uwsgi.log)"
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
