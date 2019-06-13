#!/usr/bin/bash
#
# Testing
# export PROJECT='jolmomar'
# ./ansible-runner-service -s
# Cert identity and password may be overridden by environment variables - see help

VERBOSE=false
PREREQS="docker openssl"
ETCDIR="/etc/ansible-runner-service"
SERVERCERTS="$ETCDIR/certs/server"
CLIENTCERTS="$ETCDIR/certs/client"
RUNNERDIR="/usr/share/ansible-runner-service"
CONTAINER_IMAGE="ansible_runner_service"

create_server_certs() {

    # Server CA
    if $VERBOSE; then 
        echo "Creating the CA Key and Certificate for signing Client Certs"
        echo "- Using cert identity - $CERT_IDENTITY"
    fi
    openssl genrsa -des3 -out $SERVERCERTS/ca.key -passout pass:$CERT_PASSWORD 4096
    openssl req -new -x509 -days 365 -key $SERVERCERTS/ca.key \
        -out $SERVERCERTS/ca.crt -passin pass:$CERT_PASSWORD \
        -subj "$CERT_IDENTITY"

    # Server cert 
    if $VERBOSE; then echo "Creating the Server Key, CSR, and Certificate"; fi
    openssl genrsa -des3 -out $SERVERCERTS/server.key.org \
        -passout pass:$CERT_PASSWORD 1024
    # Remove password (avoid server claiming for it each time it starts)
    openssl rsa -in $SERVERCERTS/server.key.org -out $SERVERCERTS/server.key \
        -passin pass:$CERT_PASSWORD
    # Generate server certificate
    openssl req -new -key $SERVERCERTS/server.key -out $SERVERCERTS/server.csr \
        -passin pass:$CERT_PASSWORD -subj "$CERT_IDENTITY"

    if $VERBOSE; then echo "Self-signing the certificate with our CA cert"; fi
    openssl x509 -req -days 365 -in $SERVERCERTS/server.csr \
        -CA $SERVERCERTS/ca.crt -CAkey $SERVERCERTS/ca.key \
        -set_serial 01 -out $SERVERCERTS/server.crt -passin pass:$CERT_PASSWORD
}

create_client_certs() {

    if $VERBOSE; then 
        echo "Creating the Client Key and CSR"
        echo "- Using client identity - $CERT_IDENTITY_CLIENT"
    fi

    openssl genrsa -des3 -out $CLIENTCERTS/client.key.org -passout pass:$CERT_PASSWORD 1024
    # Remove password (avoid https client claiming for it in each request)
    openssl rsa -in $CLIENTCERTS/client.key.org -out $CLIENTCERTS/client.key \
        -passin pass:$CERT_PASSWORD
    # Generate client certificate
    openssl req -new -key $CLIENTCERTS/client.key -out $CLIENTCERTS/client.csr \
        -passin pass:$CERT_PASSWORD -subj "$CERT_IDENTITY_CLIENT"
    
    if $VERBOSE; then echo "Signing the client certificate with our CA cert"; fi
    openssl x509 -req -days 365 -in $CLIENTCERTS/client.csr -CA $SERVERCERTS/ca.crt \
        -CAkey $SERVERCERTS/ca.key -CAcreateserial -out $BASE_PATH/client/client.crt \
        -passin pass:$CERT_PASSWORD
}

create_certs() {
    echo "Checking SSL Certificate configuration"
    if [ ! -d "$ETCDIR/certs/server/ca.crt" ]; then
        create_server_certs
    fi

    if [ ! -d "$ETCDIR/certs/client/client.crt" ]; then 
        create_client_certs
    fi
}

fetch_container() {
    docker images | grep runner-service > /dev/null 2>&1
    if [[ ?$ -ne 0 ]]; then
        echo "Fetching ansible runner service container. Please wait..."
        docker pull "$PROJECT/$CONTAINER_IMAGE:latest"
        if [[ $? -ne 0 ]]; then 
            echo "Failed to fetch the container. Unable to continue"
            exit 4
        fi
    fi
}

start_container() {
    echo "Starting container"
    docker run --rm -d --network=host -p 5001:5001/tcp \
               -v /usr/share/ansible-runner-service:/usr/share/ansible-runner-service \
               -v /usr/share/ceph-ansible:/usr/share/ansible-runner-service/project
               -v /etc/ansible-runner-service:/etc/ansible-runner-service 
               --name runner-service $PROJECT/$CONTAINER_IMAGE > /dev/null 2>&1
    if [[ $? -ne 0 ]]; then 
        echo "Failed to start the container"
        exit 8
    fi
}

stop_runner_service() {
    echo "Stopping runner-service"
    docker kill runner-service > /dev/null 2>&1
}

setup_dirs() {
    echo "Checking/creating directories"
    if [ ! -d "$ETCDIR" ]; then 
        if $VERBOSE; then 
            echo "Creating directories in /etc"
        fi
        mkdir -p /etc/ansible-runner-service/certs/{client,server}
    fi
    if [ ! -d "$RUNNERDIR" ]; then 
        if $VERBOSE; then 
            echo "Creating directories in /usr/share"
        fi
        mkdir -p /usr/share/ansible-runner-service/{artifacts,env,inventory,project}
        chcon -Rt container_file_t /usr/share/ansible-runner-service
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
    echo "Checking environment"

    # must run as root
    if [ $(whoami) != 'root' ]; then 
        errors+="\tScript must run as the root user\n"
    fi

    if [ -z $PROJECT ]; then
        errors+="\tEnvironment variable PROJECT must be set to the project holding the ansible_runner_service container\n"
    fi

    for binary in ${PREREQS[@]}; do
        out=$(whereis $binary)
        if [[ ${#out} -le 10 ]]; then 
            errors+="\t$binary not found.\n"
        else
            if $VERBOSE; then 
                echo -e "\t$binary is present"
            fi
        fi
    done

    if [[ ! -d "/usr/share/ceph-ansible" ]]; then 
        errors+="\tceph-ansible is not installed.\n"
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
    echo -e "\nansible-runner-service -h -v -s -k"
    echo -e "\t-h ... display usage information"
    echo -e "\t-v ... verbose mode"
    echo -e "\t-s ... start ansible runner service container (default)"
    echo -e "\t-k ... stop/kill the ansible runner service container\n"
    echo "The service uses mutual TLS auth and will set up self-signed certs if they are not provided."
    echo "Default locations are as follows;"
    echo -e "\t server certs ... $SERVERCERTS"
    echo -e "\t client certs ... $CLIENTCERTS\n"
    echo "Self signed certificates use defaults for server/client identity and certificate password. To"
    echo "override the defaults, simply set the environment variables before invoking this utility"
    echo -e "\t CERT_IDENTITY ... server certificate id (subject)"
    echo -e "\t CERT_IDENTITY_CLIENT ... server certificate id (subject)"
    echo -e "\t CERT_PASSWORD ... password used to lock and access the server cert"
}

is_running() {
    if $VERBOSE; then 
        echo "Checking container is active"
    fi

    docker ps | grep runner-service > /dev/null 2>&1
    
}

start_runner_service() {

    if ! environment_ok; then 
        echo "Unable to start the ansible_runner_service container"
        exit
    fi

    if ! is_running; then
        echo "Runner service is already running"
        exit
    fi

    setup_dirs

    create_certs

    if [ $(getenforce) == "Enforcing" ]; then 
        set_selinux
    fi

    fetch_container

    start_container

}

main() {

    if [[ "$@[@]" =~ "-v" ]]; then
        VERBOSE=true
    fi
    
    while getopts ":khsv" option; do 
        case "${option}" in 
            h)
                usage
                exit
                ;;
            s)
                start_runner_service
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
