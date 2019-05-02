import React from 'react';
import '../../app.scss';

export class RadioSet extends React.Component {
    //
    // radio button group component
    constructor(props) {
        super(props);

        this.state = {
            name: props.config.name,
            selected: props.config.default
        };
    }

    changeHandler = (event) => {
        console.log("radio set " + this.props.config.name + " changed");
        console.log("value is " + event.target.value);
        this.setState({selected: event.target.value});
        this.props.callback(event);
    }

    render() {
        var radioGrpClass;
        var labelClass;
        var toolTip;
        var radioGrp;
        var buttons;
        if (this.props.config.horizontal) {
            radioGrpClass = "radio radio-common display-inline-block";
            labelClass = "radio-label-horizontal display-inline-block";
        } else {
            radioGrpClass = "radio radio-common display-block";
            labelClass = "radio-label-vertical";
        }

        if (this.props.config.tooltip) {
            let info = this.props.config.tooltip.split('\n').map((text, key) => {
                return <div key={key}>{text}</div>;
            });
            toolTip = (
                <div className="textInfo">
                    &nbsp;<span className="pficon pficon-info" />
                    <span className="tooltipContent">{info}</span>
                </div>
            );
        } else {
            toolTip = (
                <span />
            );
        }
        buttons = this.props.config.options.map((text, i) => {
            return (
                <div className={ radioGrpClass } key={i}>
                    <label>
                        <input type="radio"
                        onClick={this.changeHandler}
                        name={ this.props.config.name }
                        value={ text }
                        defaultChecked={ this.props.config.default === text } />
                        { text }
                    </label>
                </div>);
        });

        if (this.props.config.info) {
            radioGrp = (
                <div className="display-inline-block">
                    <div className="radio-info">{this.props.config.info}</div>
                    <div>
                        <div className="radio-spacer display-inline-block">&nbsp;</div>
                        {buttons}
                    </div>
                </div>
            );
        } else {
            radioGrp = buttons;
        }

        return (
            <div>
                <div className="display-inline-block radio-container">
                    <div className={labelClass}><b>{this.props.config.description}</b>{ toolTip }</div>
                    {radioGrp}
                </div>
            </div>
        );
    }
}
