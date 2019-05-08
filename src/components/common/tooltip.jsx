import React from 'react';
import '../../app.scss';

export class Tooltip extends React.Component {
    //
    // Simple tooltip widget
    // constructor(props) {
    //     super(props);

    //     this.state = {
    //         timer: 0,
    //         active: false
    //     };
    //     this.loadInterval = 0;
    // }

    render() {
        let tooltipText = this.props.text.split('\n').map((text, key) => {
            return <div key={key}>{text}</div>;
        });
        return (
            <div className="textInfo">&nbsp;
                <span className="pficon pficon-info" />
                <span className="tooltipContent">{ tooltipText }</span>
            </div>);
    }
}
