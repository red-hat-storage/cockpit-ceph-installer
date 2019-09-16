import React from 'react';
import '../../app.scss';
import { Tooltip } from './tooltip.jsx';

export class RadioSet extends React.Component {
    //
    // radio button group component
    constructor(props) {
        super(props);

        this.state = {
            default: this.props.default,
            name: props.config.name,
            selected: props.default
        };
    }

    componentDidUpdate(prevProps, prevState) {
        console.log("props changed in radioset");
        if (prevProps.default != this.props.default) {
            console.log("sendng change of default :" + this.props.default);
            this.updateDefault(this.props.default);
        }
        // if (!prevProps.visible) {
        //     this.refs.hostInputField.focus();
        //     console.log("with props " + JSON.stringify(prevProps));
        // }
    }

    updateDefault = (option) => {
        console.log("updating " + this.props.config.name + " as default changed");
        this.setState({default: option});
    }

    changeHandler = (event) => {
        console.log("radio set " + this.props.config.name + " changed");
        console.log("value is " + event.target.value);
        this.setState({selected: event.target.value});
        this.props.callback(event);
    }

    render() {
        console.log("in radioset render for " + this.props.config.name);
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
            toolTip = (<Tooltip text={ this.props.config.tooltip} />);
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
                        onChange={this.changeHandler}
                        name={ this.props.config.name }
                        value={ text }
                        checked={ text.valueOf() === this.state.default.valueOf() } />
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
