import React from 'react';
import '../../app.scss';

export class RadioSet extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            name: props.config.name,
            selected: props.config.default
        };

        // this.config = props.config;
        // this.changeHandler = this.changeHandler.bind(this);
        // this.radioStyle = {
        //     marginRight: "10px"
        // };

        // if (!this.config.horizontal) {
        //     delete this.radioStyle.display;
        // }
    }

    changeHandler = (event) => {
        console.log("radio set " + this.props.config.name + " changed");
        console.log("value is " + event.target.value);
        this.setState({selected: event.target.value});
        this.props.callback(event);
    }

    render() {
        var radioGrpClass;
        var toolTip;
        if (this.props.config.horizontal) {
            radioGrpClass = "radio-common radio-inline";
        } else {
            radioGrpClass = "radio-common radio-block";
        }

        if (this.props.config.tooltip != '') {
            let info = this.props.config.tooltip.split('\n').map((text, key) => {
                return <div key={key}>{text}</div>;
            });
            toolTip = (
                <div className="textInfo">
                    &nbsp;<sup><span className="pficon-info" /></sup>
                    <span className="tooltipContent">{info}</span>
                </div>
            );
        } else {
            toolTip = (
                <span />
            );
        }

        return (
            <div>
                <div><b>{this.props.config.description}</b>{ toolTip }</div>

                {
                    this.props.config.options.map((text, i) => (
                        <label className={ radioGrpClass } key={ i }>
                            <input type="radio"
                            onClick={this.changeHandler}
                            // style={ this.radioStyle }
                            name={ this.props.config.name }
                            value={ text }
                            defaultChecked={ this.props.config.default === text } />
                            { text }
                        </label>
                    ))
                }
            </div>
        );
    }
}
