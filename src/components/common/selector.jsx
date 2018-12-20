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
        let divStyle;
        let labelStyle;
        if (this.props.horizontal) {
            divStyle = "display-inline-block sel-container-horizontal";
            labelStyle = "display-block sel-label-horizontal";
        } else {
            divStyle = "display-block sel-container-vertical";
            labelStyle = "display-inline-block sel-label-vertical";
        }
        var options = this.props.options.map(function(opt, item) {
            return <option key={ item } value={ opt }>{ opt }</option>;
        });
        return (
            <div className={divStyle}>
                <div className={labelStyle}><b>{this.props.labelName}</b></div>
                <select className="dropdown" value={this.props.value} onChange={this.selectorChanged}>
                    { options }
                </select>
            </div>
        );
    }
}
