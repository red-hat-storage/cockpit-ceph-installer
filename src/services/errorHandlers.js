export function decodeAddError(hostName, error) {
    let hostStatus = '';
    let hostInfo = '';

    switch (error.status) {
    case 401:
        console.log("SSH key problem with " + hostName);
        hostStatus = "NOTOK";
        hostInfo = "SSH Auth failure to " + hostName;
        break;
    case 404:
        console.log("Server " + hostName + " not found");
        hostStatus = "NOTOK";
        hostInfo = "Host not found (DNS issue?)";
        break;
    case 500:
        console.error("error returned from the ansible-runner-service");
        hostStatus = "NOTOK";
        hostInfo = "Failed request in 'ansible-runner-service'. Please check logs";
        break;
    case 504:
        console.error("Timed out waiting for ssh response");
        hostStatus = "NOTOK";
        hostInfo = "SSH connection failed with a timeout error";
        break;
    default:
        console.error("Unknown error condition");
        hostStatus = 'NOTOK';
        hostInfo = "Unknown error (" + error.status + "), please check ansible-runner-service logs";
    }
    return {statusText: hostStatus, statusDescription: hostInfo};
}
