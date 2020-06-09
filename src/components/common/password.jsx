import React from 'react';
import '../../app.scss';

export class PasswordBox extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            type: 'password',
            msgText: '',
            icon: 'fa-eye-slash',
            password: props.password,
        };
    }

    checkPasswordValid = (event) => {
        if (event.target.value.length > 16) {
            event.target.value = event.target.value.substr(0, 16);
        }
        var pattern = (/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,16}$/);

        if (!event.target.value.match(pattern)) {
            this.setState({
                msgText: "8-16 chars, alphanumeric with >=1 special character"
            });
        } else {
            this.setState({
                msgText: 'OK'
            });
        }
    }

    passwordReady = (event) => {
        console.log("check password is usable and if so, return to caller");
        if (this.state.msgText == 'OK') {
            this.props.callback(this.props.name, event.target.value);
        } else {
            this.props.callback(this.props.name, '');
        }
    }

    switchMode = (event) => {
        let newType, newIcon;
        newType = (this.state.type == 'text') ? 'password' : 'text';
        newIcon = (newType == 'text') ? 'fa-eye' : 'fa-eye-slash';
        this.setState({
            type: newType,
            icon: newIcon,
        });
    }

    render() {
        let msgClass;
        switch (this.state.msgText) {
        case '':
        case 'OK':
            msgClass = "success";
            break;
        default:
            msgClass = "errorText";
        }

        return (
            <div className="float-right password-width">
                <label className="password-label" htmlFor={this.props.name}>{this.props.name}</label>
                <div>
                    <input type={this.state.type}
                        id={this.props.name}
                        name={this.props.name}
                        defaultValue={this.state.password}
                        className="form-control input-text display-inline-block textinput-padding"
                        maxLength="32"
                        size="32"
                        placeholder="password"
                        onChange={this.checkPasswordValid}
                        onBlur={this.passwordReady} />
                    <span className={"fa " + this.state.icon + " password-eye"} onClick={this.switchMode} />
                </div>
                <div>
                    <span className={msgClass} >{this.state.msgText}</span>
                </div>
            </div>
        );
    }
}
