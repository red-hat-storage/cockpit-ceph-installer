import React from 'react';
import '../../app.scss';

export class GenericModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        let showHideClass = this.props.show ? 'modal display-block' : 'modal display-none';
        return (
            <div className={showHideClass}>
                <section className="modal-main">
                    <div>
                        { this.props.content }
                        <br />
                        <button
                            className="modal-close btn btn-primary btn-lg"
                            onClick={this.props.closeHandler}>
                            Close
                        </button>
                    </div>
                </section>
            </div>
        );
    }
}
