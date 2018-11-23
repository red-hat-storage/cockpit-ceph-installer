import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import '../app.scss';

export class DeployPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (

            <div id="deploy" className={this.props.className}>
                <h3>Deploy the Cluster</h3>
                <NextButton action={this.props.action} />
                {/* <button className="btnRight btn btn-primary btn-lg" onClick={this.props.action}>Next</button> */}
            </div>
        );
    }
}

export default DeployPage;
