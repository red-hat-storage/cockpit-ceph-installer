import React from 'react';
import '../app.scss';

export class InfoBar extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <div id="info">
                {this.props.info}
            </div>
        );
    }
}

export default InfoBar;
