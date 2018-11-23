import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import '../app.scss';

export class WelcomePage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            className: this.props.className
        };
    }

    render() {
        return (

            <div id="welcome" className={this.props.className}>
                <h3>Welcome</h3>
                This installation process provides a guided workflow to help you install
                your Ceph cluster. <br />
                The main components of the installation workflow are represented above. Once a
                step is complete, you automatically move on to the next step but can return to
                a prior steps by simply clicking the relevant step number above.
                <p />
                The information below describes the installation steps;<br />
                <table >
                    <tbody>
                        <tr>
                            <td className="tdTitles" >Environment</td>
                            <td>The target environment defines the high level scope of the installation. Within this
                            option you delcare items such as;
                            <ul>
                                <li>installation source</li>
                                <li>OSD type <i>(e.g 'legacy' filestore or bluestore)</i></li>
                                <li>data security features <i>(e.g. encryption)</i></li>
                            </ul>
                            </td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Hosts</td>
                            <td>Declare the hosts that will be used within the cluster by Ceph role - mon, mgr, osd or rgw</td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Validation</td>
                            <td>Validate the configuration of the candidate hosts against the required Ceph roles using established
                            best practice guidelines
                            </td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Network</td>
                            <td>Network subnet declaration for the front end (client) and backend (ceph) networks</td>
                        </tr>
                        <tr>
                            <td className="tdTitles">Deploy</td>
                            <td>Start the installation process and monitor progress</td>
                        </tr>
                    </tbody>
                </table>
                <NextButton action={this.props.action} />
            </div>
        );
    }
}

export default WelcomePage;
