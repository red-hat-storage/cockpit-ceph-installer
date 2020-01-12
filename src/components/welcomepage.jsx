import React from 'react';
import { UIButton } from './common/nextbutton.jsx';
import { GenericModal } from './common/modal.jsx';
import '../app.scss';

export class WelcomePage extends React.Component {
    //
    // Initial welcome page presented prior to the configuration pages
    constructor(props) {
        super(props);
        this.state = {
            modalVisible: false,
            modalTitle: '',
            modalContent: '',
            className: this.props.className
        };
    }

    hideModal = () => {
        this.setState({
            modalVisible: false,
            modalContent: ''
        });
    }

    render() {
        return (

            <div id="welcome" className={this.props.className}>
                <h3>Welcome</h3>
                This installation process provides a guided workflow to help you install
                your Ceph cluster. <br />
                The main components of the installation workflow are represented above. Each page in
                 this process has navigation buttons placed at the bottom right of the window, enabling you to
                 proceed and return to prior steps in the workflow.
                <p />
                <GenericModal
                    show={this.state.modalVisible}
                    content={this.state.modalContent}
                    title={this.state.modalTitle}
                    closeHandler={this.hideModal} />
                The information below describes the installation steps;<br />
                <table >
                    <tbody>
                        <tr>
                            <td className="tdTitles" >Environment</td>
                            <td>The target environment defines the high level scope of the installation. Within this
                            option you declare items such as;<ul>
                                <li>installation source</li>
                                <li>OSD type <i>(e.g &apos;legacy&apos; FileStore or BlueStore)</i></li>
                                <li>data security features <i>(e.g. encryption)</i></li>
                            </ul>
                            </td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Hosts</td>
                            <td>Declare the hosts that will be used within the cluster by Ceph role - mon, mgr, osd, rgw or mds</td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Validation</td>
                            <td>Validate the configuration of the candidate Ceph hosts against the required Ceph roles using established
                            best practice guidelines
                            </td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Network</td>
                            <td>Network subnet declaration for the front end (client) and backend (ceph) networks</td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Review</td>
                            <td>Review the configuration settings made prior to installation</td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Deploy</td>
                            <td>Save your selections, start the deployment process and monitor installation progress.</td>
                        </tr>
                    </tbody>
                </table>

                <div className="nav-button-container">
                    <UIButton primary btnLabel="Environment &rsaquo;" action={this.props.action} />
                </div>
            </div>
        );
    }
}

export default WelcomePage;
