import React from 'react';
import '../../app.scss';

export class Selector extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
        };
    }

    selectorChanged = (event) => {
        console.log("selector changed: " + event.target.value);
        this.props.callback(event);
    }

    render() {
        console.log("rendering selector");
        var options = this.props.options.map(function(opt, item) {
            return <option key={ item } value={ opt }>{ opt }</option>;
        });
        return (
            <div style={{display: "inline-block", width: "200px"}}>
                <div><b>{this.props.labelName}</b></div>
                <select className="dropdown" value={this.props.value} onChange={this.selectorChanged}>
                    { options }
                </select>
            </div>
        );
    }
}
