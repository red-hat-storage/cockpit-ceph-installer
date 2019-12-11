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
            let out;
            if (text.includes('!Link:')) {
                let [prefix, therest] = text.split('!Link:');
                let [protocol, urlPath, linkName, remainingText] = therest.split(':');
                let url = protocol + ":" + urlPath;
                out = (<span>{prefix}<a href={url} target="_blank">{linkName}</a>{remainingText}</span>);
            } else {
                out = text;
            }
            return <div key={key}>{out}</div>;
        });
        return (
            <div className="textInfo">&nbsp;
                <span className="pficon pficon-info" />
                <span className="tooltipContent">{ tooltipText }</span>
            </div>);
    }
}
