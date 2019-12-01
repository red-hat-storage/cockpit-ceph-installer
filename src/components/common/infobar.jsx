import React from 'react';
import '../../app.scss';

export class InfoBar extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        let infoTip = (<div />); // default is show nothing
        if (this.props.info) {
            infoTip = (<div>
                <span className="pficon pficon-info" />&nbsp;
                <span>{this.props.info}</span>
            </div>);
        }

        return (
            <div id="info">
                { infoTip }
            </div>
        );
    }
}

export default InfoBar;
